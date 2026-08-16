import type { DesignSnapshot, SnapshotComponent } from "@solderlab/design-core";
import { attachMcuDetection } from "@solderlab/bsc";
import fs from "node:fs";
import path from "node:path";
import { resolveConnectivity } from "./connectivity";
import {
  parseKicadProject,
  parseKicadProjectDirHierarchical,
  discoverProjectRoots,
} from "./hierarchy";
import {
  extractProperty,
  extractQuoted,
  extractSymbolInstanceBlocks,
  extractUuid,
} from "./sexpr";

export {
  parseKicadProject,
  parseKicadProjectDirHierarchical,
  discoverProjectRoots,
};
export {
  classifyNet,
  expandBusMembers,
  isPowerFlagComponent,
  normalizeNetName,
  resolveConnectivity,
  unescapeKiCadNetName,
} from "./connectivity";
export * from "./pcb";
export * from "./libs";

function parseComponent(block: string): SnapshotComponent | null {
  const refdes = extractProperty(block, "Reference");
  if (!refdes || refdes.endsWith("?")) return null;
  const value = extractProperty(block, "Value") ?? "";
  const footprint = extractProperty(block, "Footprint") ?? "";
  const mpn =
    extractProperty(block, "MPN") ??
    extractProperty(block, "Manufacturer_Part_Number") ??
    extractProperty(block, "PartNumber");
  const manufacturer = extractProperty(block, "Manufacturer");
  const libId = extractQuoted(block, "lib_id");
  const uuid = extractUuid(block);
  const at = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?/);
  return {
    refdes,
    value,
    footprint,
    mpn: mpn || undefined,
    manufacturer: manufacturer || undefined,
    libId: libId || undefined,
    uuid: uuid || undefined,
    sheetId: "root",
    sheetPath: "/root",
    libraryStatus: "ok",
    x: at ? Number(at[1]) : undefined,
    y: at ? Number(at[2]) : undefined,
    rotation: at?.[3] != null ? Number(at[3]) : 0,
  };
}

/** Parse a single schematic text blob (flat / one sheet). */
export function parseKicadSchematicText(src: string): DesignSnapshot {
  const blocks = extractSymbolInstanceBlocks(src);
  const components: SnapshotComponent[] = [];
  for (const b of blocks) {
    const c = parseComponent(b);
    if (c) components.push(c);
  }
  const byKey = new Map<string, SnapshotComponent>();
  for (const c of components) {
    const key = c.uuid?.trim() || c.refdes;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const uniq = [...byKey.values()].sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );

  const resolved = resolveConnectivity(src, uniq);
  const nets = resolved.nets;

  return attachMcuDetection({
    schemaVersion: 1,
    tool: { name: "kicad", version: extractQuoted(src, "version") },
    sheets: [{ id: "root", name: "Root", title: "Main" }],
    components: resolved.components,
    nets,
    meta: {
      sheetCount: 1,
      componentCount: resolved.components.length,
      netCount: nets.length,
      unresolvedLibs: [],
    },
  });
}

/** Prefer hierarchical project walk; never unions sibling unrelated boards. */
export function parseKicadProjectDir(dir: string): DesignSnapshot {
  return parseKicadProjectDirHierarchical(dir);
}

export function findSchematicFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
        walk(p);
      } else if (ent.name.endsWith(".kicad_sch")) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}
