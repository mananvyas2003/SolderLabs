import fs from "node:fs";
import path from "node:path";

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

const ORACLE_RE = new RegExp(String.raw`\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)`, "g");

function padsFor(pcbPath) {
  const src = fs.readFileSync(pcbPath, "utf8");
  const out = [];
  let fpRef = "(no-fp)";
  for (const block of extractBlocks(src, "footprint")) {
    const ref = block.match(/\(fp_text\s+reference\s+"([^"]+)"/)?.[1] ?? "(anon)";
    for (const pad of extractBlocks(block, "pad")) {
      const pn = pad.match(/^\(pad\s+"([^"]+)"/)?.[1];
      const net = pad.match(/\(net\s+\d+\s+"([^"]+)"\)/)?.[1];
      if (net === "GND") out.push(`${ref}.${pn}`);
    }
  }
  // standalone pads not inside footprint
  ORACLE_RE.lastIndex = 0;
  return out.sort();
}

for (const [name, pcb] of [
  ["sprig", "fixtures/corpus/sprig/older/mainboard_PCB/kicad/sprig_console.kicad_pcb"],
  ["piantor-left", "fixtures/corpus/piantor/newer/left/keyboard_pcb.kicad_pcb"],
]) {
  console.log(`\n=== ${name}`);
  const pads = padsFor(pcb);
  console.log(`GND pads (${pads.length}):`, pads.join(", "));
}
