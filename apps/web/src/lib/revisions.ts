import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  parseKicadProjectDir,
  parseKicadPcbProjectDir,
} from "@solderlab/parser";
import { snapshotToBom, semanticDiff, diffSnapshots, findUnintendedConnectivity, reconcileBom, lintManufacturingPackage, type DesignSnapshot } from "@solderlab/design-core";
import { generateBSC } from "@solderlab/bsc";
import { track } from "@solderlab/analytics";
import { sha256, writeStorage, storagePath } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
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
      status: "skipped",
      severity: "info",
      summary: "No ERC report uploaded — skipped",
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

  const zip = new AdmZip(opts.zipBuffer);
  const entries = zip.getEntries();
  if (entries.length > 8000) {
    throw new Error("Zip has too many entries");
  }
  let uncompressed = 0;
  for (const e of entries) {
    const name = e.entryName.replace(/\\/g, "/");
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      /^[a-zA-Z]:/.test(name)
    ) {
      throw new Error(`Illegal zip path: ${name}`);
    }
    uncompressed += e.header.size;
    if (uncompressed > 400 * 1024 * 1024) {
      throw new Error("Decompressed zip exceeds size limit");
    }
  }

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

  const zipKey = `${opts.projectId}/${revisionId}/source.zip`;
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
  zip.extractAllTo(extractDir, true);

  let parseRoot = extractDir;
  const ents = fs.readdirSync(extractDir, { withFileTypes: true });
  if (ents.length === 1 && ents[0].isDirectory()) {
    parseRoot = path.join(extractDir, ents[0].name);
  }

  try {
    const parseStarted = Date.now();
    const snapshot = parseKicadProjectDir(parseRoot);
    const parseDurationMs = Date.now() - parseStarted;
    const snapJson = JSON.stringify(snapshot);
    writeStorage(`${opts.projectId}/${revisionId}/snapshot.json`, snapJson);
    db.designSnapshots.push({
      id: nanoid(),
      revisionId,
      schemaVersion: 1,
      dataJson: snapJson,
    });

    try {
      const bsc = generateBSC(snapshot, {
        boardName: project?.slug ?? opts.projectId,
        revisionId,
      });
      const nullFieldCount = countBscNulls(bsc);
      track(
        "bsc_generated",
        {
          boardId: project?.slug ?? opts.projectId,
          pinCount: bsc.pins.length,
          nullFieldCount,
        },
        { orgId: orgId || null },
      );
    } catch {
      /* BSC generation must never fail the parse */
    }

    track(
      "parse_completed",
      {
        projectId: opts.projectId,
        componentCount: snapshot.components.length,
        durationMs: parseDurationMs,
        success: true,
        unresolvedLibs: snapshot.meta.unresolvedLibs?.length ?? 0,
      },
      { orgId: orgId || null },
    );

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
            severity:
              elec.summary.criticalCount > 0
                ? "critical"
                : elec.summary.gate === "FAIL"
                  ? "significant"
                  : "ok",
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

          const bundle = diffSnapshots(parentSnap, snapshot, {
            baseRevisionId: opts.parentRevisionId,
            headRevisionId: revisionId,
          });
          const unintended = findUnintendedConnectivity(
            bundle,
            opts.message,
          );
          db.checkRuns.push({
            id: nanoid(),
            projectId: opts.projectId,
            revisionId,
            reviewId: null,
            name: "unintended-connectivity",
            status: unintended.length ? "fail" : "pass",
            summary: unintended.length
              ? `${unintended.length} net change(s) not acknowledged in revision message`
              : "All net membership changes acknowledged in message",
            detailsJson: JSON.stringify({ findings: unintended }),
            createdAt: now,
          });
        } catch {
          db.checkRuns.push({
            id: nanoid(),
            projectId: opts.projectId,
            revisionId,
            reviewId: null,
            name: "connectivity-gate",
            status: "error",
            severity: "critical",
            summary: "Could not compute electrical diff vs parent",
            detailsJson: null,
            createdAt: now,
          });
          db.checkRuns.push({
            id: nanoid(),
            projectId: opts.projectId,
            revisionId,
            reviewId: null,
            name: "unintended-connectivity",
            status: "error",
            summary: "Could not compute net-diff vs parent",
            detailsJson: null,
            createdAt: now,
          });
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
        severity: "ok",
        summary: "Root revision — no parent to diff",
        detailsJson: JSON.stringify({ skipped: true }),
        createdAt: now,
      });
      db.checkRuns.push({
        id: nanoid(),
        projectId: opts.projectId,
        revisionId,
        reviewId: null,
        name: "unintended-connectivity",
        status: "pass",
        summary: "Root revision — no parent to diff",
        detailsJson: JSON.stringify({ skipped: true }),
        createdAt: now,
      });
    }

    // BOM reconciliation — platform metadata vs schematic (never write CAD)
    const platform = db.bomPlatformLines
      .filter((p) => p.projectId === opts.projectId)
      .map((p) => ({
        uuid: p.uuid ?? undefined,
        refdes: p.refdes,
        mpn: p.mpn,
        manufacturer: p.manufacturer,
        alternateMpns: p.alternateMpnsJson
          ? (JSON.parse(p.alternateMpnsJson) as string[])
          : [],
        dnp: p.dnp,
        notes: p.notes,
        lockedValue: p.lockedValue,
        lockedFootprint: p.lockedFootprint,
      }));
    const drift = reconcileBom(snapshot.components, platform);
    const driftErrors = drift.filter(
      (d) =>
        d.kind === "value_changed_mpn_stale" ||
        d.kind === "footprint_changed_mpn_stale",
    );
    db.checkRuns.push({
      id: nanoid(),
      projectId: opts.projectId,
      revisionId,
      reviewId: null,
      name: "bom-reconcile",
      status: driftErrors.length ? "fail" : "pass",
      summary: driftErrors.length
        ? `${driftErrors.length} BOM drift finding(s) (stale MPN vs CAD)`
        : drift.length
          ? `${drift.length} soft BOM note(s); no stale-MPN failures`
          : "BOM metadata in sync with schematic",
      detailsJson: JSON.stringify({ findings: drift }),
      createdAt: now,
    });

    // Manufacturing package linter
    const pcbRow = db.pcbSnapshots.find((p) => p.revisionId === revisionId);
    let placement: Array<{ refdes: string }> = [];
    if (pcbRow) {
      try {
        const pcb = JSON.parse(pcbRow.dataJson) as {
          footprints?: Array<{ refdes: string }>;
        };
        placement = (pcb.footprints ?? []).map((f) => ({ refdes: f.refdes }));
      } catch {
        /* ignore */
      }
    }
    const gerberLayers = db.artifacts
      .filter(
        (a) =>
          a.revisionId === revisionId &&
          /\.(gbr|gerber)$/i.test(a.path),
      )
      .map((a) => ({ name: path.basename(a.path) }));
    const mfg = lintManufacturingPackage({
      bom: bom.map((b) => ({
        refdes: b.refdes,
        mpn: b.mpn,
        value: b.value,
        footprint: b.footprint,
      })),
      placement,
      gerberLayers: gerberLayers.length ? gerberLayers : undefined,
      declaredStackup: gerberLayers.length
        ? [
            { name: "F.Cu", type: "copper" },
            { name: "B.Cu", type: "copper" },
          ]
        : undefined,
    });
    db.checkRuns.push({
      id: nanoid(),
      projectId: opts.projectId,
      revisionId,
      reviewId: null,
      name: "mfg-package-lint",
      status: mfg.findings.some(
        (f) =>
          f.severity === "error" &&
          f.code !== "bom_missing_mpn", // covered by bom-mpn check
      )
        ? "fail"
        : "pass",
      summary: mfg.summary,
      detailsJson: JSON.stringify(mfg),
      createdAt: now,
    });

    const rev = db.revisions.find((r) => r.id === revisionId)!;
    const missingSheet = snapshot.warnings?.some((w) => w.code === "missing-sheet");
    rev.parseStatus =
      snapshot.parseStatus === "partial" || missingSheet ? "partial" : "succeeded";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse failed";
    const rev = db.revisions.find((r) => r.id === revisionId)!;
    rev.parseStatus = "failed";
    track(
      "parse_completed",
      {
        projectId: opts.projectId,
        componentCount: 0,
        durationMs: 0,
        success: false,
        unresolvedLibs: 0,
      },
      { orgId: orgId || null },
    );
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

/**
 * Turn an upload into a project zip. Accepts:
 * - `.zip` KiCad project archives (passthrough)
 * - `.kicad_sch` single schematics (wrapped into a one-file project zip)
 */
export function normalizeUploadToZip(
  fileName: string,
  buffer: Buffer,
): { zipBuffer: Buffer; kind: "zip" | "kicad_sch" } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) {
    return { zipBuffer: buffer, kind: "zip" };
  }
  if (lower.endsWith(".kicad_sch")) {
    const base = path.basename(fileName).replace(/[^\w.\-()+ ]+/g, "_") || "schematic.kicad_sch";
    const name = base.toLowerCase().endsWith(".kicad_sch")
      ? base
      : `${base}.kicad_sch`;
    const zip = new AdmZip();
    zip.addFile(name, buffer);
    return { zipBuffer: zip.toBuffer(), kind: "kicad_sch" };
  }
  throw new Error(
    "Unsupported file type. Upload a KiCad project .zip or a .kicad_sch schematic.",
  );
}

export function revisionChecksPassing(projectId: string, revisionId: string) {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  const checks = db.checkRuns.filter((c) => c.revisionId === revisionId);
  const declaredRequired = ["bom-mpn", "connectivity-gate", "unintended-connectivity"];
  const blockingStatus = new Set(["fail", "error", "pending", "running"]);

  const failing = checks.filter((c) => blockingStatus.has(c.status));
  const missing = declaredRequired.filter((name) => !checks.some((c) => c.name === name));
  const missingAsFails = missing.map((name) => ({
    name,
    summary: `Required check never ran: ${name}`,
    status: "missing",
  }));

  if (project?.requireGreenChecks && (failing.length || missing.length)) {
    return {
      ok: false as const,
      failing: [
        ...failing,
        ...missingAsFails.map((m) => ({
          name: m.name,
          summary: m.summary,
          status: m.status,
        })),
      ],
      required: declaredRequired,
    };
  }
  return { ok: true as const, failing: [], required: declaredRequired };
}

function countBscNulls(value: unknown): number {
  if (value === null) return 1;
  if (Array.isArray(value)) {
    return value.reduce<number>((n, v) => n + countBscNulls(v), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (n, v) => n + countBscNulls(v),
      0,
    );
  }
  return 0;
}
