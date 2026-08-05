import type { DesignSnapshot, SnapshotComponent, SnapshotNet } from "@flux/design-core";
import fs from "node:fs";
import path from "node:path";

/** Minimal KiCad s-expr property extractor (MVP — not a full parser) */
function extractQuoted(block: string, key: string): string | undefined {
  const re = new RegExp(`\\(${key}\\s+"([^"]*)"\\)`);
  const m = block.match(re);
  return m?.[1];
}

function extractProperty(block: string, name: string): string | undefined {
  const re = new RegExp(
    `\\(property\\s+"${name}"\\s+"([^"]*)"`,
    "i",
  );
  const m = block.match(re);
  return m?.[1];
}

function extractSymbolBlocks(src: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf("(symbol", i);
    if (start < 0) break;
    // skip lib_symbols section symbols that are definitions (have "lib_id" differently)
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
    // Instance symbols in sheets look like: (symbol (lib_id "...") (at ...) (unit 1) ... (property "Reference" "R1"
    if (block.includes('(property "Reference"') || block.includes("(property \"Reference\"")) {
      blocks.push(block);
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
  const at = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)/);
  return {
    refdes,
    value,
    footprint,
    mpn: mpn || undefined,
    manufacturer: manufacturer || undefined,
    sheetId: "root",
    x: at ? Number(at[1]) : undefined,
    y: at ? Number(at[2]) : undefined,
  };
}

function parseNetsFromLabels(src: string): SnapshotNet[] {
  const nets = new Map<string, Set<string>>();
  const labelRe = /\(label\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(src))) {
    const name = m[1];
    if (!nets.has(name)) nets.set(name, new Set());
  }
  const globalRe = /\(global_label\s+"([^"]+)"/g;
  while ((m = globalRe.exec(src))) {
    const name = m[1];
    if (!nets.has(name)) nets.set(name, new Set());
  }
  return [...nets.entries()].map(([name, nodes]) => ({
    name,
    class: /^(VCC|VDD|VBUS|\+|[0-9]+V|GND|AGND|PGND)/i.test(name)
      ? name.toUpperCase().includes("GND")
        ? "ground"
        : "power"
      : "signal",
    nodes: [...nodes],
  }));
}

export function parseKicadSchematicText(src: string): DesignSnapshot {
  const blocks = extractSymbolBlocks(src);
  const components: SnapshotComponent[] = [];
  for (const b of blocks) {
    const c = parseComponent(b);
    if (c) components.push(c);
  }
  // Deduplicate by refdes (multi-unit)
  const byRef = new Map<string, SnapshotComponent>();
  for (const c of components) {
    if (!byRef.has(c.refdes)) byRef.set(c.refdes, c);
  }
  const uniq = [...byRef.values()].sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );
  const nets = parseNetsFromLabels(src);
  return {
    schemaVersion: 1,
    tool: { name: "kicad", version: extractQuoted(src, "version") },
    sheets: [{ id: "root", name: "Root", title: "Main" }],
    components: uniq,
    nets,
    meta: {
      sheetCount: 1,
      componentCount: uniq.length,
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
  // Prefer root schematic (not in subsheets named differently) — merge all unique refdes
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
  merged.nets = [...netMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  merged.meta = {
    sheetCount: merged.sheets.length,
    componentCount: merged.components.length,
    netCount: merged.nets.length,
  };
  return merged;
}

export * from "./pcb";

