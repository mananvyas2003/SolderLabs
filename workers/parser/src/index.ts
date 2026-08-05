import type { DesignSnapshot, SnapshotComponent, SnapshotNet } from "@flux/design-core";
import fs from "node:fs";
import path from "node:path";
import { resolveConnectivity } from "./connectivity";

function extractQuoted(block: string, key: string): string | undefined {
  const re = new RegExp(`\\(${key}\\s+"([^"]*)"\\)`);
  const m = block.match(re);
  return m?.[1];
}

function extractProperty(block: string, name: string): string | undefined {
  const re = new RegExp(`\\(property\\s+"${name}"\\s+"([^"]*)"`, "i");
  const m = block.match(re);
  return m?.[1];
}

function extractSymbolBlocks(src: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf("(symbol", i);
    if (start < 0) break;
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const block = src.slice(start, j);
    if (
      block.includes('(property "Reference"') ||
      block.includes('(property "Reference"')
    ) {
      // Skip lib_symbols definitions (they use "SymbolName" not Reference instances)
      if (!/^\(symbol\s+"/.test(block.trim()) || block.includes("(lib_id")) {
        if (block.includes("(lib_id")) blocks.push(block);
      }
    }
    i = j;
  }
  return blocks;
}

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
  const at = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?/);
  return {
    refdes,
    value,
    footprint,
    mpn: mpn || undefined,
    manufacturer: manufacturer || undefined,
    libId: libId || undefined,
    sheetId: "root",
    x: at ? Number(at[1]) : undefined,
    y: at ? Number(at[2]) : undefined,
    rotation: at?.[3] != null ? Number(at[3]) : 0,
  };
}

export function parseKicadSchematicText(src: string): DesignSnapshot {
  const blocks = extractSymbolBlocks(src);
  const components: SnapshotComponent[] = [];
  for (const b of blocks) {
    const c = parseComponent(b);
    if (c) components.push(c);
  }
  const byRef = new Map<string, SnapshotComponent>();
  for (const c of components) {
    if (!byRef.has(c.refdes)) byRef.set(c.refdes, c);
  }
  const uniq = [...byRef.values()].sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );

  const resolved = resolveConnectivity(src, uniq);
  // Fallback: if no wires produced nets, keep label names for presence
  let nets = resolved.nets;
  if (!nets.length) {
    const labelNames = new Set<string>();
    for (const m of src.matchAll(/\(label\s+"([^"]+)"/g)) labelNames.add(m[1]);
    for (const m of src.matchAll(/\(global_label\s+"([^"]+)"/g))
      labelNames.add(m[1]);
    nets = [...labelNames].sort().map((name) => ({
      name,
      class: /GND/i.test(name)
        ? ("ground" as const)
        : /^(VCC|VDD)/i.test(name)
          ? ("power" as const)
          : ("signal" as const),
      nodes: [] as string[],
      isNamed: true,
    }));
  }

  return {
    schemaVersion: 1,
    tool: { name: "kicad", version: extractQuoted(src, "version") },
    sheets: [{ id: "root", name: "Root", title: "Main" }],
    components: resolved.components,
    nets,
    meta: {
      sheetCount: 1,
      componentCount: resolved.components.length,
      netCount: nets.length,
    },
  };
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

export function parseKicadProjectDir(dir: string): DesignSnapshot {
  const files = findSchematicFiles(dir);
  if (!files.length) {
    throw new Error("No .kicad_sch files found in upload");
  }
  const merged: DesignSnapshot = {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [],
    components: [],
    nets: [],
    meta: { sheetCount: 0, componentCount: 0, netCount: 0 },
  };
  const compMap = new Map<string, SnapshotComponent>();
  const netMap = new Map<string, SnapshotNet>();

  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const snap = parseKicadSchematicText(text);
    const sheetId = path.basename(f, ".kicad_sch");
    merged.sheets.push({ id: sheetId, name: sheetId, title: sheetId });
    for (const c of snap.components) {
      if (!compMap.has(c.refdes)) {
        compMap.set(c.refdes, { ...c, sheetId });
      }
    }
    for (const n of snap.nets) {
      const existing = netMap.get(n.name);
      if (!existing) netMap.set(n.name, { ...n });
      else {
        existing.nodes = [...new Set([...existing.nodes, ...n.nodes])];
      }
    }
  }

  merged.components = [...compMap.values()].sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );
  merged.nets = [...netMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  merged.meta = {
    sheetCount: merged.sheets.length,
    componentCount: merged.components.length,
    netCount: merged.nets.length,
  };
  return merged;
}

export * from "./pcb";
export { resolveConnectivity } from "./connectivity";
