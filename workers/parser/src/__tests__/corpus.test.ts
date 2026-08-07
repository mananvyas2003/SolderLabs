import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadProjectDir } from "../index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const corpusRoot = path.join(repoRoot, "fixtures/corpus");
const manifestPath = path.join(corpusRoot, "manifest.json");

interface ManifestRev {
  label: string;
  status: string;
  path: string;
  componentCount: number;
  sheetCount: number;
}

interface ManifestProject {
  id: string;
  revisions: ManifestRev[];
  primary?: { componentCount: number; sheetCount: number };
}

function pickRevision(p: ManifestProject): ManifestRev | null {
  const newer = p.revisions.find((r) => r.label === "newer" && r.status === "ok");
  if (newer) return newer;
  return p.revisions.find((r) => r.status === "ok") ?? null;
}

test("corpus hierarchical parse report + assertions", async () => {
  assert.ok(fs.existsSync(manifestPath), "manifest.json missing — run corpus:fetch");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as { projects: ManifestProject[] };

  type Row = {
    project: string;
    components: number;
    nets: number;
    sheets: number;
    parseMs: number;
    unresolvedLibs: number;
    nullUuid: number;
    pinsMissingNet: number;
    manifestComps: number;
    deltaPct: string;
    ok: boolean;
    note: string;
  };
  const rows: Row[] = [];

  for (const p of manifest.projects) {
    const rev = pickRevision(p);
    if (!rev) {
      rows.push({
        project: p.id,
        components: 0,
        nets: 0,
        sheets: 0,
        parseMs: 0,
        unresolvedLibs: 0,
        nullUuid: 0,
        pinsMissingNet: 0,
        manifestComps: 0,
        deltaPct: "n/a",
        ok: false,
        note: "no ok revision",
      });
      continue;
    }
    const abs = path.resolve(repoRoot, rev.path);
    const t0 = performance.now();
    let snap;
    let err = "";
    try {
      snap = parseKicadProjectDir(abs);
    } catch (e) {
      err = String((e as Error).message ?? e);
      rows.push({
        project: p.id,
        components: 0,
        nets: 0,
        sheets: 0,
        parseMs: Math.round(performance.now() - t0),
        unresolvedLibs: 0,
        nullUuid: 0,
        pinsMissingNet: 0,
        manifestComps: rev.componentCount,
        deltaPct: "fail",
        ok: false,
        note: err,
      });
      continue;
    }
    const parseMs = Math.round(performance.now() - t0);
    const nullUuid = snap.components.filter((c) => !c.uuid).length;
    let pinsMissingNet = 0;
    let pinTotal = 0;
    for (const c of snap.components) {
      for (const pin of c.pins ?? []) {
        pinTotal++;
        if (!pin.net) pinsMissingNet++;
      }
    }
    // If connectivity produced no pins for a BOM-ish part, count as weakness
    const bare = snap.components.filter(
      (c) => !c.refdes.startsWith("#") && !(c.pins && c.pins.length),
    ).length;

    const man = rev.componentCount;
    const delta = man ? ((snap.components.length - man) / man) * 100 : 0;
    const within2 = Math.abs(delta) <= 2;
    rows.push({
      project: p.id,
      components: snap.components.length,
      nets: snap.nets.length,
      sheets: snap.sheets.length,
      parseMs,
      unresolvedLibs: snap.meta.unresolvedLibs?.length ?? 0,
      nullUuid,
      pinsMissingNet: pinsMissingNet + bare,
      manifestComps: man,
      deltaPct: `${delta.toFixed(1)}%`,
      ok: within2 && nullUuid === 0 && pinsMissingNet === 0 && bare === 0,
      note: snap.meta.projectRoot ?? "",
    });
  }

  // Weakness report — always printed
  console.log(
    "\nproject                          comps   nets sheets   ms  unresLibs nullUuid pinGap  Δ%manifest  ok  root",
  );
  console.log("-".repeat(120));
  for (const r of rows) {
    console.log(
      [
        r.project.padEnd(32),
        String(r.components).padStart(5),
        String(r.nets).padStart(6),
        String(r.sheets).padStart(6),
        String(r.parseMs).padStart(5),
        String(r.unresolvedLibs).padStart(10),
        String(r.nullUuid).padStart(8),
        String(r.pinsMissingNet).padStart(6),
        r.deltaPct.padStart(10),
        r.ok ? " ✓" : " ✗",
        r.note,
      ].join(" "),
    );
  }
  console.log("");

  for (const r of rows) {
    assert.notEqual(r.note, "no ok revision", `${r.project}: missing revision`);
    assert.notEqual(r.deltaPct, "fail", `${r.project}: parse failed — ${r.note}`);
    assert.equal(r.nullUuid, 0, `${r.project}: components with null UUID`);
    assert.equal(
      r.pinsMissingNet,
      0,
      `${r.project}: pins without net (or bare components)`,
    );
    const man = r.manifestComps;
    const delta = man ? Math.abs((r.components - man) / man) : 1;
    assert.ok(
      delta <= 0.02,
      `${r.project}: component count ${r.components} vs manifest ${man} (Δ=${r.deltaPct}) — refresh manifest after hierarchical parse if counts intentionally changed`,
    );
  }
});
