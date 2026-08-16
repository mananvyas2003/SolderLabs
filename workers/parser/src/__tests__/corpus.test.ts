import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadProjectDir } from "../index.ts";
import {
  exportNetlistWithKicadCli,
  findKicadCli,
  parseKicadExportNetlist,
  sharedNetMembershipMismatches,
  schematicPathFromProjectRoot,
} from "../kicad-netlist-oracle.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const corpusRoot = path.join(repoRoot, "fixtures/corpus");
const manifestPath = path.join(corpusRoot, "manifest.json");
const exclusionsPath = path.join(here, "netlist-exclusions.json");

interface ManifestRev {
  label: string;
  status: string;
  path: string;
}

interface ManifestProject {
  id: string;
  revisions: ManifestRev[];
}

function pickRevision(p: ManifestProject): ManifestRev | null {
  const newer = p.revisions.find((r) => r.label === "newer" && r.status === "ok");
  if (newer) return newer;
  return p.revisions.find((r) => r.status === "ok") ?? null;
}

test("corpus net membership equals kicad-cli export netlist", async (t) => {
  const required = Boolean(process.env.CI || process.env.CORPUS_REQUIRED);
  if (!fs.existsSync(manifestPath)) {
    if (required) {
      assert.fail("fixtures/corpus/manifest.json missing — run corpus:fetch");
    }
    t.skip("manifest.json missing — run npm run corpus:fetch");
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    projects: ManifestProject[];
  };
  const missing: string[] = [];
  const picked: Array<{ id: string; abs: string }> = [];
  for (const p of manifest.projects) {
    const rev = pickRevision(p);
    if (!rev) {
      missing.push(`${p.id}: no ok revision`);
      continue;
    }
    const abs = path.resolve(repoRoot, rev.path);
    if (!fs.existsSync(abs)) missing.push(`${p.id}: path missing (${rev.path})`);
    else picked.push({ id: p.id, abs });
  }
  if (missing.length) {
    if (required) {
      assert.fail(`corpus incomplete:\n${missing.join("\n")}`);
    }
    t.skip(`corpus incomplete (${missing.length} boards) — run npm run corpus:fetch`);
    return;
  }

  const kicadRequired = Boolean(
    process.env.CI || process.env.CORPUS_REQUIRE_KICAD,
  );
  if (!findKicadCli()) {
    if (kicadRequired) {
      assert.fail("kicad-cli is required for corpus net membership (set KICAD_CLI)");
    }
    t.skip("kicad-cli not installed — skipping netlist oracle");
    return;
  }

  const exclusions = JSON.parse(fs.readFileSync(exclusionsPath, "utf8")) as {
    allowed?: string[];
    unreadableBoards?: string[];
    pinsetMismatchBudget?: Record<string, number>;
  };
  const allowedUnread = new Set(exclusions.unreadableBoards ?? []);
  const budget = exclusions.pinsetMismatchBudget ?? {};
  const unreadHits: string[] = [];
  const staleUnread: string[] = [];
  const overBudget: string[] = [];
  const staleBudget: string[] = [];

  for (const p of picked) {
    const snap = parseKicadProjectDir(p.abs);
    const sch = schematicPathFromProjectRoot(p.abs, snap.meta.projectRoot);
    if (!sch) {
      overBudget.push(`${p.id}: no schematic path from projectRoot=${snap.meta.projectRoot}`);
      continue;
    }
    let oracle: Map<string, string[]>;
    try {
      oracle = parseKicadExportNetlist(exportNetlistWithKicadCli(sch));
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (allowedUnread.has(p.id)) {
        unreadHits.push(p.id);
        continue;
      }
      overBudget.push(`${p.id}: kicad-cli ${msg}`);
      continue;
    }
    if (allowedUnread.has(p.id)) staleUnread.push(p.id);

    const ours = new Map<string, string[]>();
    for (const n of snap.nets) {
      const prev = ours.get(n.name) ?? [];
      ours.set(n.name, [...new Set([...prev, ...n.nodes])]);
    }

    const diffs = sharedNetMembershipMismatches(ours, oracle, {
      ignorePowerFlagPins: true,
    });
    const cap = budget[p.id] ?? 0;
    if (diffs.length > cap) {
      overBudget.push(
        `${p.id}: ${diffs.length} pin-set mismatches (budget ${cap})\n  ${diffs.slice(0, 8).join("\n  ")}`,
      );
    } else if (p.id in budget && diffs.length < cap) {
      staleBudget.push(`${p.id}: actual ${diffs.length} < budget ${cap} — lower the budget`);
    }
  }

  for (const id of allowedUnread) {
    if (!unreadHits.includes(id) && !staleUnread.includes(id)) {
      /* listed but not in this run's picked set */
    }
  }

  assert.equal(
    staleUnread.length,
    0,
    `unreadableBoards must shrink — kicad-cli can load: ${staleUnread.join(", ")}`,
  );
  assert.equal(
    staleBudget.length,
    0,
    `pinsetMismatchBudget must shrink:\n${staleBudget.join("\n")}`,
  );
  assert.equal(
    overBudget.length,
    0,
    `net membership diverged from kicad-cli:\n${overBudget.join("\n")}`,
  );
});
