#!/usr/bin/env node
/**
 * Compare pre-expansion and post-expansion GND counts for ethersweep.
 */
import path from "node:path";
import fs from "node:fs";

const CORPUS = path.resolve("fixtures/corpus");
const dir = path.join(CORPUS, "ethersweep");

// Count GND pads per PCB file (same logic as verifier oracle)
function pcbGndPadCount(pcbPath) {
  const src = fs.readFileSync(pcbPath, "utf8");
  const re = /\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;
  let count = 0, m;
  while ((m = re.exec(src))) if (m[1] === "GND") count++;
  return count;
}

// Find all pros
function walk(d, depth = 0) {
  const out = [];
  if (depth > 5) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p, depth + 1));
    else if (e.name.endsWith(".kicad_pro")) out.push(p);
  }
  return out;
}

const pros = walk(dir);
console.log(`Found ${pros.length} .kicad_pro files`);

// Parse each pro and count GND nodes BEFORE expansion
// (by temporarily checking what parseSingleKicadProject returns without expansion)
const { parseKicadProjectDir } = await import("../workers/parser/src/index.ts");

let totalSch = 0;
let totalPcb = 0;
for (const pro of pros) {
  const proDir = path.dirname(pro);
  const rel = path.relative(dir, pro);
  
  // Count PCB GND pads
  const pcbPath = path.join(proDir, "ethersweep.kicad_pcb");
  let pcbCount = 0;
  if (fs.existsSync(pcbPath)) {
    pcbCount = pcbGndPadCount(pcbPath);
  }
  
  // Parse schematic (this includes expansion now)
  const snap = parseKicadProjectDir(proDir);
  const gnd = snap.nets.find(n => n.name === "GND");
  const schCount = gnd ? gnd.nodes.length : 0;
  
  totalSch += schCount;
  totalPcb += pcbCount;
  
  console.log(`  ${rel.padEnd(60)} sch=${String(schCount).padStart(4)} pcb=${String(pcbCount).padStart(4)} diff=${schCount - pcbCount}`);
}
console.log(`\nTotal: sch=${totalSch} pcb=${totalPcb} diff=${totalSch - totalPcb}`);

// What does the oracle see for the whole board dir?
const walkPcb = (d, depth = 0) => {
  const out = [];
  if (depth > 5) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walkPcb(p, depth + 1));
    else if (e.name.endsWith(".kicad_pcb")) out.push(p);
  }
  return out;
};
const allPcbs = walkPcb(dir);
let oracleTotal = 0;
for (const pcb of allPcbs) {
  oracleTotal += pcbGndPadCount(pcb);
}
console.log(`Oracle total (recursive): ${oracleTotal}`);
console.log(`All PCBs found: ${allPcbs.length}`);
