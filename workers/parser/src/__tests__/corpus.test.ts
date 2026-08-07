import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadProjectDir } from "../index.ts";
import { countProjectInstances } from "../instance-count.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const corpusRoot = path.join(repoRoot, "fixtures/corpus");
const manifestPath = path.join(corpusRoot, "manifest.json");

interface ManifestRev {
  label: string;
  status: string;
  path: string;
  componentCount: number;
  instanceCount?: number;
  instanceCountNonPower?: number;
  sheetCount: number;
  oracle?: string;
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

test("corpus hierarchical parse vs instance oracle", async (t) => {
  if (!fs.existsSync(manifestPath)) {
    t.skip("manifest.json missing — run npm run corpus:fetch");
    return;
  }
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as { projects: ManifestProject[] };

  type Row = {
    project: string;
    components: number;
    oracle: number;
    nets: number;
    sheets: number;
    parseMs: number;
    nullUuid: number;
    pinsMissingNet: number;
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
        oracle: 0,
        nets: 0,
        sheets: 0,
        parseMs: 0,
        nullUuid: 0,
        pinsMissingNet: 0,
        ok: false,
        note: "no ok revision",
      });
      continue;
    }
    const abs = path.resolve(repoRoot, rev.path);
    if (!fs.existsSync(abs)) {
      rows.push({
        project: p.id,
        components: 0,
        oracle: rev.instanceCount ?? rev.componentCount,
        nets: 0,
        sheets: 0,
        parseMs: 0,
        nullUuid: 0,
        pinsMissingNet: 0,
        ok: false,
        note: "path missing — run corpus:fetch",
      });
      continue;
    }
    const t0 = performance.now();
    let snap;
    try {
      snap = parseKicadProjectDir(abs);
    } catch (e) {
      rows.push({
        project: p.id,
        components: 0,
        oracle: rev.instanceCount ?? rev.componentCount,
        nets: 0,
        sheets: 0,
        parseMs: Math.round(performance.now() - t0),
        nullUuid: 0,
        pinsMissingNet: 0,
        ok: false,
        note: String((e as Error).message ?? e),
      });
      continue;
    }
    const parseMs = Math.round(performance.now() - t0);
    const ind = countProjectInstances(abs);
    const oracle = ind.total;
    const nullUuid = snap.components.filter((c) => !c.uuid).length;
    let pinsMissingNet = 0;
    for (const c of snap.components) {
      for (const pin of c.pins ?? []) {
        if (!pin.net) pinsMissingNet++;
      }
    }
    const bare = snap.components.filter(
      (c) => !c.refdes.startsWith("#") && !(c.pins && c.pins.length),
    ).length;

    rows.push({
      project: p.id,
      components: snap.components.length,
      oracle,
      nets: snap.nets.length,
      sheets: snap.sheets.length,
      parseMs,
      nullUuid,
      pinsMissingNet: pinsMissingNet + bare,
      ok:
        snap.components.length === oracle &&
        nullUuid === 0 &&
        pinsMissingNet === 0 &&
        bare === 0,
      note: snap.meta.projectRoot ?? "",
    });
  }

  console.log(
    "\nproject                          comps oracle   nets sheets   ms nullUuid pinGap  ok  root",
  );
  console.log("-".repeat(110));
  for (const r of rows) {
    console.log(
      [
        r.project.padEnd(32),
        String(r.components).padStart(5),
        String(r.oracle).padStart(6),
        String(r.nets).padStart(6),
        String(r.sheets).padStart(6),
        String(r.parseMs).padStart(5),
        String(r.nullUuid).padStart(8),
        String(r.pinsMissingNet).padStart(6),
        r.ok ? " ✓" : " ✗",
        r.note,
      ].join(" "),
    );
  }
  console.log("");

  for (const r of rows) {
    if (r.note.includes("path missing") || r.note === "no ok revision") {
      // Soft-skip unfetched boards so `npm test` works without 2.3GB corpus
      continue;
    }
    assert.notEqual(r.note.includes("fail") && r.components === 0, true, `${r.project}: ${r.note}`);
    assert.equal(r.nullUuid, 0, `${r.project}: components with null UUID`);
    assert.equal(
      r.pinsMissingNet,
      0,
      `${r.project}: pins without net (or bare components)`,
    );
    assert.equal(
      r.components,
      r.oracle,
      `${r.project}: parser ${r.components} != hierarchical instance oracle ${r.oracle}`,
    );
  }
});
