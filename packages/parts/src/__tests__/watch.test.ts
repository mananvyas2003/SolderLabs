import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, persist, nowIso, resetDbCache, emptyDb } from "@solderlab/db";
import type { PartDataProvider, PartDataResult } from "../types.ts";
import { runPartWatchJob } from "../job.ts";
import { evaluateBomLifecycle } from "../check.ts";
import { DEFAULT_BATCH_SIZE } from "../types.ts";
import { revisionChecksPassing } from "../../../../apps/web/src/lib/check-gate.ts";

function isolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-parts-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "solderlab.json")}`;
  resetDbCache();
  const db = getDb();
  Object.assign(db, emptyDb());
  persist();
  return db;
}

function seedOrg(
  db: ReturnType<typeof getDb>,
  opts: { orgId: string; projects: string[]; mpn: string },
) {
  const now = nowIso();
  if (!db.organizations.some((o) => o.id === opts.orgId)) {
    db.organizations.push({
      id: opts.orgId,
      name: opts.orgId,
      slug: opts.orgId,
      createdAt: now,
    });
  }
  for (const pid of opts.projects) {
    db.projects.push({
      id: pid,
      orgId: opts.orgId,
      name: pid,
      slug: pid,
      description: null,
      visibility: "private",
      defaultBranch: "main",
      requireGreenChecks: true,
      requireApproval: false,
      requiredApprovals: 1,
      createdAt: now,
    });
    const rev = `${pid}-rev`;
    db.branches.push({
      id: `${pid}-br`,
      projectId: pid,
      name: "main",
      headRevisionId: rev,
    });
    db.revisions.push({
      id: rev,
      projectId: pid,
      branchId: `${pid}-br`,
      parentRevisionId: null,
      message: "head",
      authorId: "u",
      parseStatus: "succeeded",
      createdAt: now,
    });
    db.bomLines.push({
      id: `${pid}-bom`,
      revisionId: rev,
      refdes: "U1",
      value: opts.mpn,
      footprint: "QFN",
      mpn: opts.mpn,
      manufacturer: "Vishay",
      qty: 1,
      attrsJson: null,
    });
  }
  persist();
}

class MapProvider implements PartDataProvider {
  requests = 0;
  lastBatches: string[][] = [];
  constructor(
    private readonly impl: (mpns: string[]) => PartDataResult[] | Promise<PartDataResult[]>,
  ) {}
  async lookup(mpns: string[]): Promise<PartDataResult[]> {
    this.requests += 1;
    this.lastBatches.push(mpns);
    return this.impl(mpns);
  }
}

function obsoleteOk(mpn: string): PartDataResult {
  return {
    ok: true,
    data: {
      mpn,
      manufacturer: "Vishay",
      lifecycleStatus: "obsolete",
      lastTimeBuyDate: "2020-01-01",
      leadTimeWeeks: 4,
      stockTotal: 10000,
      priceBreaks: [{ qty: 1, unitPrice: 1 }],
    },
  };
}

test("D1: obsolete MPN yields one critical PartAlert", async () => {
  const db = isolatedDb();
  seedOrg(db, { orgId: "o1", projects: ["p1"], mpn: "OBS-123" });
  const provider = new MapProvider((mpns) => mpns.map(obsoleteOk));
  await runPartWatchJob(db, {
    provider,
    persist,
    nowIso,
    delayMs: 0,
  });
  const alerts = db.partAlerts.filter((a) => a.mpn === "OBS-123");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.severity, "critical");
  assert.equal(alerts[0]!.kind, "lifecycle");
  console.log("D1_ALERT", JSON.stringify(alerts[0], null, 2));
});

test("D2: one alert lists three projects", async () => {
  const db = isolatedDb();
  seedOrg(db, { orgId: "o1", projects: ["p1", "p2", "p3"], mpn: "SHARED-1" });
  const provider = new MapProvider((mpns) => mpns.map(obsoleteOk));
  await runPartWatchJob(db, {
    provider,
    persist,
    nowIso,
    delayMs: 0,
  });
  const alerts = db.partAlerts.filter((a) => a.mpn === "SHARED-1");
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0]!.affectedProjects.sort(), ["p1", "p2", "p3"]);
  console.log("D2_ALERT", JSON.stringify(alerts[0], null, 2));
});

test("D3: HTTP 500 sets unknown and does not refresh lastCheckedAt or flip to active", async () => {
  const db = isolatedDb();
  seedOrg(db, { orgId: "o1", projects: ["p1"], mpn: "LIVE-1" });
  const t1 = "2026-01-01T00:00:00.000Z";
  await runPartWatchJob(db, {
    provider: new MapProvider((mpns) =>
      mpns.map((mpn) => ({
        ok: true as const,
        data: {
          mpn,
          manufacturer: "X",
          lifecycleStatus: "active" as const,
          lastTimeBuyDate: null,
          leadTimeWeeks: 2,
          stockTotal: 1000,
          priceBreaks: [],
        },
      })),
    ),
    persist,
    nowIso: () => t1,
    delayMs: 0,
  });
  assert.equal(db.partWatches[0]!.lifecycleStatus, "active");
  assert.equal(db.partWatches[0]!.lastCheckedAt, t1);

  const t2 = "2026-01-02T00:00:00.000Z";
  await runPartWatchJob(db, {
    provider: new MapProvider((mpns) =>
      mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "http_error" as const,
        message: "HTTP 500",
        httpStatus: 500,
      })),
    ),
    persist,
    nowIso: () => t2,
    delayMs: 0,
  });
  assert.equal(db.partWatches[0]!.lifecycleStatus, "unknown");
  assert.equal(db.partWatches[0]!.lastCheckedAt, t1);
  assert.ok(db.partWatches[0]!.lastCheckedAt! < t2);
  assert.notEqual(db.partWatches[0]!.lifecycleStatus, "active");
  console.log("D3_WATCHES", JSON.stringify(db.partWatches, null, 2));
});

test("D4: malformed payload leaves prior data intact", async () => {
  const db = isolatedDb();
  seedOrg(db, { orgId: "o1", projects: ["p1"], mpn: "KEEP-1" });
  await runPartWatchJob(db, {
    provider: new MapProvider((mpns) =>
      mpns.map((mpn) => ({
        ok: true as const,
        data: {
          mpn,
          manufacturer: "KeepCo",
          lifecycleStatus: "active" as const,
          lastTimeBuyDate: null,
          leadTimeWeeks: 3,
          stockTotal: 42,
          priceBreaks: [{ qty: 100, unitPrice: 0.5 }],
        },
      })),
    ),
    persist,
    nowIso: () => "2026-02-01T00:00:00.000Z",
    delayMs: 0,
  });
  const before = structuredClone(db.partWatches[0]!);
  await runPartWatchJob(db, {
    provider: new MapProvider((mpns) =>
      mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "malformed" as const,
        message: "garbage",
      })),
    ),
    persist,
    nowIso: () => "2026-02-02T00:00:00.000Z",
    delayMs: 0,
  });
  assert.deepEqual(db.partWatches[0], before);
  console.log("D4_WATCH", JSON.stringify(db.partWatches[0], null, 2));
});

test("D5: 500 MPNs across 5 orgs are batched", async () => {
  const db = isolatedDb();
  const now = nowIso();
  const mpns: string[] = [];
  for (let o = 0; o < 5; o++) {
    const orgId = `org${o}`;
    db.organizations.push({
      id: orgId,
      name: orgId,
      slug: orgId,
      createdAt: now,
    });
    const pid = `proj${o}`;
    db.projects.push({
      id: pid,
      orgId,
      name: pid,
      slug: pid,
      description: null,
      visibility: "private",
      defaultBranch: "main",
      requireGreenChecks: true,
      requireApproval: false,
      requiredApprovals: 1,
      createdAt: now,
    });
    const rev = `${pid}-rev`;
    db.branches.push({
      id: `${pid}-br`,
      projectId: pid,
      name: "main",
      headRevisionId: rev,
    });
    db.revisions.push({
      id: rev,
      projectId: pid,
      branchId: `${pid}-br`,
      parentRevisionId: null,
      message: "head",
      authorId: "u",
      parseStatus: "succeeded",
      createdAt: now,
    });
    for (let i = 0; i < 100; i++) {
      const mpn = `MPN-${o}-${i}`;
      mpns.push(mpn);
      db.bomLines.push({
        id: `${pid}-${i}`,
        revisionId: rev,
        refdes: `U${i}`,
        value: mpn,
        footprint: "0402",
        mpn,
        manufacturer: null,
        qty: 1,
        attrsJson: null,
      });
    }
  }
  persist();
  const provider = new MapProvider((batch) =>
    batch.map((mpn) => ({
      ok: true as const,
      data: {
        mpn,
        manufacturer: null,
        lifecycleStatus: "unknown" as const,
        lastTimeBuyDate: null,
        leadTimeWeeks: null,
        stockTotal: null,
        priceBreaks: [],
      },
    })),
  );
  const stats = await runPartWatchJob(db, {
    provider,
    persist,
    nowIso,
    delayMs: 0,
    batchSize: DEFAULT_BATCH_SIZE,
    shareLookups: true,
  });
  assert.equal(mpns.length, 500);
  assert.equal(stats.batchSize, 50);
  assert.equal(stats.requestCount, 10);
  assert.ok(provider.lastBatches.every((b) => b.length <= 50));
  console.log(
    "D5_RATE",
    JSON.stringify({ requestCount: stats.requestCount, batchSize: stats.batchSize }),
  );
});

test("D6: bom-lifecycle fails the green-check gate", () => {
  const db = isolatedDb();
  seedOrg(db, { orgId: "o1", projects: ["p1"], mpn: "OBS-123" });
  db.partAlerts.push({
    id: "a1",
    orgId: "o1",
    mpn: "OBS-123",
    kind: "lifecycle",
    severity: "critical",
    detectedAt: nowIso(),
    acknowledgedBy: null,
    affectedProjects: ["p1"],
    detail: "obsolete",
  });
  persist();
  const evaled = evaluateBomLifecycle(db, "o1", "p1-rev");
  assert.equal(evaled.status, "fail");
  const now = nowIso();
  for (const name of ["bom-mpn", "connectivity-gate", "unintended-connectivity"] as const) {
    db.checkRuns.push({
      id: `pass-${name}`,
      projectId: "p1",
      revisionId: "p1-rev",
      reviewId: null,
      name,
      status: "pass",
      summary: "ok",
      detailsJson: "{}",
      createdAt: now,
    });
  }
  db.checkRuns.push({
    id: "c1",
    projectId: "p1",
    revisionId: "p1-rev",
    reviewId: null,
    name: "bom-lifecycle",
    status: "fail",
    summary: evaled.summary,
    detailsJson: JSON.stringify(evaled.details),
    createdAt: now,
  });
  persist();
  const gate = revisionChecksPassing("p1", "p1-rev");
  assert.equal(gate.ok, false);
  assert.ok(gate.failing.some((c) => c.name === "bom-lifecycle"));
  console.log("D6_GATE", JSON.stringify(gate, null, 2));
});
