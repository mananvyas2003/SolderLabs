/**
 * Refresh fixtures/corpus/manifest.json component/sheet counts using the
 * hierarchical parser — replaces the inflated Reference-property heuristic.
 */
import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";

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
      const prev = rev.componentCount;
      rev.componentCount = snap.components.length;
      rev.sheetCount = snap.sheets.length;
      rev.parserProjectRoot = snap.meta.projectRoot;
      rev.unresolvedLibCount = snap.meta.unresolvedLibs?.length ?? 0;
      console.log(
        `${project.id}/${rev.label}: comps ${prev} → ${rev.componentCount}, sheets ${rev.sheetCount}, root=${rev.parserProjectRoot}`,
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
    project.primary.sheetCount = primary.sheetCount;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("\nUpdated", manifestPath);
