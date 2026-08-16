import type { PcbSnapshot, PcbFootprint, PcbTrack } from "@solderlab/design-core";
import fs from "node:fs";
import path from "node:path";

function extractBlocks(src: string, keyword: string): string[] {
  const blocks: string[] = [];
  const needle = `(${keyword}`;
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(needle, i);
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
    blocks.push(src.slice(start, j));
    i = j;
  }
  return blocks;
}

function extractProperty(block: string, name: string): string | undefined {
  const re = new RegExp(`\\(property\\s+"${name}"\\s+"([^"]*)"`, "i");
  return block.match(re)?.[1];
}

export function parseKicadPcbText(src: string): PcbSnapshot {
  const footprints: PcbFootprint[] = [];
  for (const block of extractBlocks(src, "footprint")) {
    const refdes = extractProperty(block, "Reference");
    if (!refdes || refdes.endsWith("?")) continue;
    const at = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?/);
    const fpName = block.match(/\(footprint\s+"([^"]+)"/)?.[1] ?? "";
    const layer = block.match(/\(layer\s+"([^"]+)"/)?.[1];
    footprints.push({
      refdes,
      footprint: fpName,
      x: at ? Number(at[1]) : 0,
      y: at ? Number(at[2]) : 0,
      rotation: at?.[3] ? Number(at[3]) : 0,
      layer,
    });
  }

  const tracks: PcbTrack[] = [];
  const layers = new Set<string>();
  for (const block of extractBlocks(src, "segment")) {
    const start = block.match(/\(start\s+([-\d.]+)\s+([-\d.]+)\)/);
    const end = block.match(/\(end\s+([-\d.]+)\s+([-\d.]+)\)/);
    const width = block.match(/\(width\s+([-\d.]+)\)/);
    const layer = block.match(/\(layer\s+"([^"]+)"/)?.[1] ?? "F.Cu";
    if (!start || !end) continue;
    layers.add(layer);
    tracks.push({
      layer,
      x1: Number(start[1]),
      y1: Number(start[2]),
      x2: Number(end[1]),
      y2: Number(end[2]),
      width: width ? Number(width[1]) : 0.2,
    });
  }

  const outline: Array<{ x: number; y: number }> = [];
  for (const block of extractBlocks(src, "gr_line")) {
    if (!block.includes("Edge.Cuts")) continue;
    const start = block.match(/\(start\s+([-\d.]+)\s+([-\d.]+)\)/);
    const end = block.match(/\(end\s+([-\d.]+)\s+([-\d.]+)\)/);
    if (start) outline.push({ x: Number(start[1]), y: Number(start[2]) });
    if (end) outline.push({ x: Number(end[1]), y: Number(end[2]) });
  }

  if (!outline.length) {
    const xs = footprints.map((f) => f.x);
    const ys = footprints.map((f) => f.y);
    const minX = (xs.length ? Math.min(...xs) : 0) - 5;
    const maxX = (xs.length ? Math.max(...xs) : 50) + 5;
    const minY = (ys.length ? Math.min(...ys) : 0) - 5;
    const maxY = (ys.length ? Math.max(...ys) : 30) + 5;
    outline.push(
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    );
  }

  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);

  return {
    schemaVersion: 1,
    outline,
    footprints: footprints.sort((a, b) =>
      a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
    ),
    tracks,
    layers: [...layers].sort(),
    meta: {
      footprintCount: footprints.length,
      trackCount: tracks.length,
      widthMm: Math.max(...xs) - Math.min(...xs),
      heightMm: Math.max(...ys) - Math.min(...ys),
    },
  };
}

export function findPcbFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".")) continue;
        walk(p);
      } else if (ent.name.endsWith(".kicad_pcb")) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

export function parseKicadPcbProjectDir(dir: string): PcbSnapshot | null {
  const files = findPcbFiles(dir);
  if (!files.length) return null;
  return parseKicadPcbText(fs.readFileSync(files[0], "utf8"));
}
