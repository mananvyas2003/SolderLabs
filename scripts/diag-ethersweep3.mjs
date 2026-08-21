// @ts-check
// Debug: what GND nodes does the schematic resolver produce for ethersweep402?
import { parseKicadProject } from "../workers/parser/src/index.ts";
import fs from "node:fs";
import path from "node:path";

const proDir = "fixtures/corpus/ethersweep/newer/development/ethersweep402";
const pro = path.join(proDir, "ethersweep.kicad_pro");

// Parse just this one board
const snap = parseKicadProject(pro);
const gnd = snap.nets.find((n) => n.name === "GND");
console.log(`Schematic GND nodes: ${gnd ? gnd.nodes.length : 0}`);
console.log(`Components: ${snap.components.length}`);

// Now count PCB pads
const pcbPath = path.join(proDir, "ethersweep.kicad_pcb");
const src = fs.readFileSync(pcbPath, "utf8");

// Walk footprint blocks and count GND pads with refdes context
let i = 0;
const pcbGndByRef = new Map();
while (i < src.length) {
  const fpStart = src.indexOf("(footprint ", i);
  if (fpStart < 0) break;
  const header = src.slice(fpStart, fpStart + 3000);
  const refdesMatch = header.match(/\(fp_text\s+reference\s+"([^"]*)"/);
  if (!refdesMatch) { i = fpStart + 11; continue; }
  const refdes = refdesMatch[1];
  let depth = 0, end = fpStart;
  for (let j = fpStart; j < src.length; j++) {
    if (src[j] === "(") depth++;
    if (src[j] === ")") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const block = src.slice(fpStart, end);
  const padRe = /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,500}?\(net\s+\d+\s+"([^"]*)"\)\)/g;
  let pm;
  const refPads = [];
  while ((pm = padRe.exec(block))) {
    if (pm[2] === "GND") {
      refPads.push(pm[1]);
    }
  }
  if (refPads.length) {
    pcbGndByRef.set(refdes, refPads);
  }
  i = end;
}

console.log(`\nPCB GND pads by refdes (${[...pcbGndByRef.values()].flat().length} total):`);
for (const [ref, pads] of [...pcbGndByRef.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  console.log(`  ${ref}: ${pads.join(", ")}`);
}

// Compare with schematic nodes
console.log(`\nSchematic GND nodes by refdes:`);
const schByRef = new Map();
if (gnd) {
  for (const node of gnd.nodes) {
    const ref = node.split(".")[0] || node;
    if (!schByRef.has(ref)) schByRef.set(ref, []);
    schByRef.get(ref).push(node);
  }
}
for (const [ref, nodes] of [...schByRef.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  const inPcb = pcbGndByRef.has(ref);
  console.log(`  ${ref}: ${nodes.join(", ")}${inPcb ? "" : " [NOT IN PCB]"}`);
}

// Find refs in PCB but not in schematic
console.log(`\nRefs in PCB but not in schematic:`);
for (const ref of [...pcbGndByRef.keys()].sort()) {
  if (!schByRef.has(ref)) {
    console.log(`  ${ref}: ${pcbGndByRef.get(ref).join(", ")}`);
  }
}
