#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";

const CORPUS = path.resolve("fixtures/corpus");
const { parseKicadProjectDir } = await import("../workers/parser/src/index.ts");

// Check piantor per-board
function pcbGndPadCount(boardDir) {
  const pcbs = [];
  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".kicad_pcb")) pcbs.push(p);
    }
  };
  walk(boardDir);
  let count = 0;
  const details = {};
  for (const p of pcbs) {
    const src = fs.readFileSync(p, "utf8");
    const re = /\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;
    let m, sub = 0;
    while ((m = re.exec(src))) if (m[1] === "GND") sub++;
    const rel = path.relative(boardDir, p);
    details[rel] = sub;
    count += sub;
  }
  return { count, details };
}

for (const board of ["piantor", "sprig"]) {
  console.log(`\n=== ${board} ===`);
  const dir = path.join(CORPUS, board);
  const { count: truth, details } = pcbGndPadCount(dir);
  console.log("Oracle truth:", truth, details);
  
  // Parse per-pro
  const pros = [];
  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".kicad_pro")) pros.push(p);
    }
  };
  walk(dir);
  
  console.log("Pros found:", pros.length);
  for (const pro of pros) {
    const rel = path.relative(dir, pro);
    try {
      const snap = parseKicadProjectDir(path.dirname(pro));
      const gnd = (snap.nets || []).find(n => n.name === "GND");
      console.log(`  ${rel}: GND nodes=${gnd ? gnd.nodes.length : 0}${gnd ? ' boardKey=' + (gnd.boardKey || 'none') : ''}`);
      if (gnd) {
        // Show first 10 nodes
        console.log(`    sample:`, gnd.nodes.slice(0, 10).join(", "));
      }
      // Count components with GND connections
      const comps = snap.components || [];
      console.log(`  components: ${comps.length}`);
    } catch (e) {
      console.log(`  ${rel}: ERROR: ${e.message}`);
    }
  }
  
  // Now parse the whole board dir
  try {
    const snap = parseKicadProjectDir(dir);
    const gnd = (snap.nets || []).find(n => n.name === "GND");
    console.log(`MERGED: GND nodes=${gnd ? gnd.nodes.length : 0}`);
    if (gnd) {
      // How many unique nodes by boardKey
      const byBoard = {};
      for (const n of gnd.nodes) {
        // Nodes don't have boardKey info directly - they're just refdes.pin strings
        // But we can count duplicates
      }
      // Check for duplicate node IDs across boards
      const unique = new Set(gnd.nodes);
      console.log(`  unique node IDs: ${unique.size}`);
      console.log(`  total nodes: ${gnd.nodes.length}`);
      console.log(`  duplicates: ${gnd.nodes.length - unique.size}`);
    }
  } catch (e) {
    console.log(`MERGED: ERROR: ${e.message}`);
  }
}
