/**
 * Refresh fixtures/corpus/manifest.json with hierarchical instance counts.
 * Oracle = symbols reachable from the project root (same rule as the parser),
 * NOT raw lib_id greps across every .kicad_sch in the tree.
 */
import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import { countProjectInstances } from "../workers/parser/src/instance-count.ts";

const manifestPath = "fixtures/corpus/manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

for (const project of manifest.projects) {
  for (const rev of project.revisions) {
    if (rev.status !== "ok" || !rev.path) continue;
    const abs = path.resolve(rev.path);
    if (!fs.existsSync(abs)) {
      console.warn("skip missing", rev.path);
      continue;
    }
    try {
      const snap = parseKicadProjectDir(abs);
      const ind = countProjectInstances(abs);
      if (ind.total !== snap.components.length) {
        console.warn(
          `${project.id}/${rev.label}: oracle ${ind.total} != parser ${snap.components.length}`,
        );
      }
      rev.componentCount = snap.components.length;
      rev.instanceCount = ind.total;
      rev.instanceCountNonPower = ind.nonPower;
      rev.sheetCount = snap.sheets.length;
      rev.parserProjectRoot = snap.meta.projectRoot;
      rev.unresolvedLibCount = snap.meta.unresolvedLibs?.length ?? 0;
      rev.oracle = "hierarchical-instance";
      console.log(
        `${project.id}/${rev.label}: instances=${ind.total} (non-power ${ind.nonPower}, power ${ind.power}) sheets=${rev.sheetCount}`,
      );
    } catch (e) {
      console.error(`${project.id}/${rev.label}:`, e.message || e);
    }
  }
  const primary =
    project.revisions.find((r) => r.label === "newer" && r.status === "ok") ||
    project.revisions.find((r) => r.status === "ok");
  if (primary && project.primary) {
    project.primary.componentCount = primary.componentCount;
    project.primary.instanceCount = primary.instanceCount;
    project.primary.sheetCount = primary.sheetCount;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("\nUpdated", manifestPath);
