import fs from "node:fs";
import path from "node:path";
const { parseKicadProjectDir } = await import(
  new URL(`file://${path.join(process.cwd(), "workers/parser/src/index.ts")}`).href
);

const dir = "fixtures/corpus/sprig/older/mainboard_PCB/kicad";
const pcb = fs.readFileSync(path.join(dir, "sprig_console.kicad_pcb"), "utf8");
const snap = parseKicadProjectDir(dir);

// Walk footprint blocks, collect pads with net GND as refdes.pad
function extractBlocks(src, tag) {
  const blocks = [];
  const needle = `(${tag}`;
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(needle, i);
    if (start < 0) break;
    let depth = 0, j = start;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") { depth--; if (depth === 0) { j++; break; } }
    }
    blocks.push(src.slice(start, j));
    i = j;
  }
  return blocks;
}
const pcbPads = new Set();
for (const fp of extractBlocks(pcb, "footprint")) {
  const ref = fp.match(/\(fp_text\s+reference\s+"([^"]+)"/)?.[1];
  if (!ref) continue;
  for (const pad of extractBlocks(fp, "pad")) {
    const pn = pad.match(/^\(pad\s+"([^"]+)"/)?.[1];
    const net = pad.match(/\(net\s+\d+\s+"([^"]+)"\)/)?.[1];
    if (net === "GND" && pn != null) pcbPads.add(`${ref}.${pn}`);
  }
}
console.log(`PCB GND pads by refdes (${pcbPads.size}):`, [...pcbPads].sort().join(", "));

const gndPins = [];
for (const c of snap.components) {
  for (const p of c.pins || []) {
    if (p.net === "GND" && !c.refdes.startsWith("#")) gndPins.push(`${c.refdes}.${p.number}`);
  }
}
console.log(`\nParser real pins on GND (${gndPins.length}):`, gndPins.sort().join(", "));

const schSet = new Set(gndPins);
const missing = [...pcbPads].filter((p) => !schSet.has(p));
const extra = [...schSet].filter((p) => !pcbPads.has(p));
console.log(`\nPCB GND pads MISSING in parser (${missing.length}):`, missing.join(", "));
console.log(`\nParser GND pins absent from PCB (${extra.length}):`, extra.join(", "));
