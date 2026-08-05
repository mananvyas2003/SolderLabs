import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import {
  parseKicadProjectDir,
  parseKicadPcbProjectDir,
} from "@flux/parser";
import { snapshotToBom, semanticDiff, type DesignSnapshot } from "@flux/design-core";
import { sha256, writeStorage, storagePath } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { storageKeyFor } from "@/lib/residency";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

function runPolicyChecks(opts: {
  projectId: string;
  orgId: string;
  revisionId: string;
  bom: Array<{ refdes: string; mpn?: string; footprint: string }>;
}) {
  const db = getDb();
  const now = nowIso();
  const library = db.libraryParts.filter((p) => p.orgId === opts.orgId);

  const missingMpn = opts.bom.filter((b) => !b.mpn);
  db.checkRuns.push({
    id: nanoid(),
    projectId: opts.projectId,
    revisionId: opts.revisionId,
    reviewId: null,
    name: "bom-mpn",
    status: missingMpn.length ? "fail" : "pass",
    summary: missingMpn.length
      ? `${missingMpn.length} BOM line(s) missing MPN`
      : "All BOM lines have MPN",
    detailsJson: JSON.stringify({
      missing: missingMpn.map((m) => m.refdes),
    }),
    createdAt: now,
  });

  if (library.length) {
    const forbidden = opts.bom.filter((b) =>
      library.some(
        (l) =>
          l.status === "forbidden" &&
          b.mpn &&
          l.mpn.toLowerCase() === b.mpn.toLowerCase(),
      ),
    );
    const unapproved = opts.bom.filter((b) => {
      if (!b.mpn) return true;
      const hit = library.find(
        (l) => l.mpn.toLowerCase() === b.mpn!.toLowerCase(),
      );
      return !hit || hit.status !== "approved";
    });
    db.checkRuns.push({
      id: nanoid(),
      projectId: opts.projectId,
      revisionId: opts.revisionId,
      reviewId: null,
      name: "bom-policy",
      status: forbidden.length || unapproved.length ? "fail" : "pass",
      summary: forbidden.length
        ? `${forbidden.length} forbidden MPN(s)`
        : unapproved.length
          ? `${unapproved.length} BOM line(s) not on approved list`
          : "BOM matches org library policy",
      detailsJson: JSON.stringify({
        forbidden: forbidden.map((f) => f.refdes),
        unapproved: unapproved.map((u) => u.refdes),
      }),
      createdAt: now,
    });
  }

  // Ingest ERC report if present in artifacts later — placeholder pass when no report
  const hasErc = db.artifacts.some(
    (a) =>
      a.revisionId === opts.revisionId &&
      /erc/i.test(a.path) &&
      a.path.endsWith(".json"),
  );
  if (!hasErc) {
    db.checkRuns.push({
      id: nanoid(),
      projectId: opts.projectId,
      revisionId: opts.revisionId,
      reviewId: null,
      name: "erc",
      status: "pass",
      summary: "No ERC report uploaded — skipped (soft pass)",
      detailsJson: JSON.stringify({ skipped: true }),
      createdAt: now,
    });
  }
}

function ingestErcDrcReports(
  projectId: string,
  revisionId: string,
  parseRoot: string,
) {
  const db = getDb();
  const now = nowIso();
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (/\.(erc|drc)\.json$/i.test(ent.name) || /erc|drc/i.test(ent.name) && ent.name.endsWith(".json")) {
        try {
          const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as {
            errors?: unknown[];
            violations?: unknown[];
            status?: string;
          };
          const errCount =
            (raw.errors?.length ?? 0) + (raw.violations?.length ?? 0);
          const name = /drc/i.test(ent.name) ? "drc" : "erc";
          // remove soft skip if present
          db.checkRuns = db.checkRuns.filter(
            (c) =>
              !(
                c.revisionId === revisionId &&
                c.name === name &&
                c.summary?.includes("skipped")
              ),
          );
          db.checkRuns.push({
            id: nanoid(),
            projectId,
            revisionId,
            reviewId: null,
            name,
            status: errCount > 0 || raw.status === "fail" ? "fail" : "pass",
            summary:
              errCount > 0
                ? `${errCount} ${name.toUpperCase()} issue(s)`
                : `${name.toUpperCase()} clean`,
            detailsJson: JSON.stringify(raw),
            createdAt: now,
          });
        } catch {
          /* ignore bad report */
        }
      }
    }
  };
  walk(parseRoot);
}

export async function createRevisionFromZip(opts: {
  projectId: string;
  branchId: string;
  authorId: string;
  message: string;
  zipBuffer: Buffer;
  parentRevisionId?: string | null;
  orgId?: string;
}) {
  const db = getDb();
  const project = db.projects.find((p) => p.id === opts.projectId);
  const orgId = opts.orgId ?? project?.orgId ?? "";
  const org = orgId ? db.organizations.find((o) => o.id === orgId) : null;
  const region = org?.dataRegion ?? "local";
  const revisionId = nanoid();
  const now = nowIso();

  db.revisions.push({
    id: revisionId,
    projectId: opts.projectId,
    branchId: opts.branchId,
    parentRevisionId: opts.parentRevisionId ?? null,
    message: opts.message,
    authorId: opts.authorId,
    parseStatus: "pending",
    createdAt: now,
  });

  const zipKey = storageKeyFor(
    region,
    opts.projectId,
    revisionId,
    "source.zip",
  );
  writeStorage(zipKey, opts.zipBuffer);
  db.artifacts.push({
    id: nanoid(),
    revisionId,
    kind: "source",
    path: "source.zip",
    storageKey: zipKey,
    sha256: sha256(opts.zipBuffer),
    sizeBytes: opts.zipBuffer.length,
  });

  const extractDir = storagePath(`${opts.projectId}/${revisionId}/extracted`);
  fs.mkdirSync(extractDir, { recursive: true });
  const zip = new AdmZip(opts.zipBuffer);
  zip.extractAllTo(extractDir, true);

  let parseRoot = extractDir;
  const ents = fs.readdirSync(extractDir, { withFileTypes: true });
  if (ents.length === 1 && ents[0].isDirectory()) {
    parseRoot = path.join(extractDir, ents[0].name);
  }

  try {
    const snapshot = parseKicadProjectDir(parseRoot);
    const snapJson = JSON.stringify(snapshot);
    writeStorage(`${opts.projectId}/${revisionId}/snapshot.json`, snapJson);
    db.designSnapshots.push({
      id: nanoid(),
      revisionId,
      schemaVersion: 1,
      dataJson: snapJson,
    });

    const pcb = parseKicadPcbProjectDir(parseRoot);
    if (pcb) {
      const pcbJson = JSON.stringify(pcb);
      writeStorage(`${opts.projectId}/${revisionId}/pcb.json`, pcbJson);
      db.pcbSnapshots.push({
        id: nanoid(),
        revisionId,
        schemaVersion: 1,
        dataJson: pcbJson,
      });
    }

    const bom = snapshotToBom(snapshot);
    for (const line of bom) {
      db.bomLines.push({
        id: nanoid(),
        revisionId,
        refdes: line.refdes,
        value: line.value,
        footprint: line.footprint,
        mpn: line.mpn ?? null,
        manufacturer: line.manufacturer ?? null,
        qty: line.qty ?? 1,
        attrsJson: null,
      });
    }

    const walk = (dir: string, rel = "") => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = path.join(rel, ent.name);
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(abs, r);
        else {
          const buf = fs.readFileSync(abs);
          const key = `${opts.projectId}/${revisionId}/files/${r.replace(/\\/g, "/")}`;
          writeStorage(key, buf);
          db.artifacts.push({
            id: nanoid(),
            revisionId,
            kind: "source",
            path: r.replace(/\\/g, "/"),
            storageKey: key,
            sha256: sha256(buf),
            sizeBytes: buf.length,
          });
        }
      }
    };
    walk(parseRoot);

    runPolicyChecks({
      projectId: opts.projectId,
      orgId,
      revisionId,
      bom: bom.map((b) => ({
        refdes: b.refdes,
        mpn: b.mpn,
        footprint: b.footprint,
      })),
    });
    ingestErcDrcReports(opts.projectId, revisionId, parseRoot);

    // NetDiff-style connectivity gate vs parent revision
    if (opts.parentRevisionId) {
      const parentSnapRow = db.designSnapshots.find(
        (s) => s.revisionId === opts.parentRevisionId,
      );
      if (parentSnapRow) {
        try {
          const parentSnap = JSON.parse(
            parentSnapRow.dataJson,
          ) as DesignSnapshot;
          const elec = semanticDiff(parentSnap, snapshot, {
            failOn: "significant",
          });
          db.checkRuns.push({
            id: nanoid(),
            projectId: opts.projectId,
            revisionId,
            reviewId: null,
            name: "connectivity-gate",
            status: elec.summary.gate === "FAIL" ? "fail" : "pass",
            summary:
              elec.summary.gate === "FAIL"
                ? `${elec.summary.significantCount} significant electrical change(s)` +
                  (elec.summary.criticalCount
                    ? ` (${elec.summary.criticalCount} critical)`
                    : "")
                : "No significant connectivity changes vs parent",
            detailsJson: JSON.stringify(elec),
            createdAt: now,
          });
        } catch {
          /* ignore bad parent snapshot */
        }
      }
    } else {
      db.checkRuns.push({
        id: nanoid(),
        projectId: opts.projectId,
        revisionId,
        reviewId: null,
        name: "connectivity-gate",
        status: "pass",
        summary: "Root revision — no parent to diff",
        detailsJson: JSON.stringify({ skipped: true }),
        createdAt: now,
      });
    }

    const rev = db.revisions.find((r) => r.id === revisionId)!;
    rev.parseStatus = "succeeded";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse failed";
    const rev = db.revisions.find((r) => r.id === revisionId)!;
    rev.parseStatus = "failed";
    db.checkRuns.push({
      id: nanoid(),
      projectId: opts.projectId,
      revisionId,
      reviewId: null,
      name: "parse",
      status: "fail",
      summary: msg,
      detailsJson: null,
      createdAt: now,
    });
  }

  const branch = db.branches.find((b) => b.id === opts.branchId);
  if (branch) branch.headRevisionId = revisionId;
  persist();

  if (orgId) {
    logActivity({
      orgId,
      projectId: opts.projectId,
      actorId: opts.authorId,
      action: "revision.uploaded",
      summary: opts.message,
      meta: { revisionId },
    });
  }

  return revisionId;
}

export async function createRevisionFromDir(opts: {
  projectId: string;
  branchId: string;
  authorId: string;
  message: string;
  dir: string;
  parentRevisionId?: string | null;
  orgId?: string;
}) {
  const zip = new AdmZip();
  zip.addLocalFolder(opts.dir);
  return createRevisionFromZip({
    ...opts,
    zipBuffer: zip.toBuffer(),
  });
}

export function revisionChecksPassing(projectId: string, revisionId: string) {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  const checks = db.checkRuns.filter((c) => c.revisionId === revisionId);
  const required = ["bom-mpn", "bom-policy", "erc", "drc"].filter((name) =>
    checks.some((c) => c.name === name),
  );
  // soft pass: only fail hard on fail status for existing required-ish checks
  const hardFails = checks.filter(
    (c) =>
      c.status === "fail" &&
      (c.name === "bom-policy" ||
        c.name === "drc" ||
        (c.name === "connectivity-gate" &&
          /critical/i.test(c.summary ?? "")) ||
        (c.name === "erc" && !c.summary?.includes("skipped"))),
  );
  if (project?.requireGreenChecks && hardFails.length) {
    return { ok: false as const, failing: hardFails };
  }
  return { ok: true as const, failing: [], required };
}
