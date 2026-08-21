#!/usr/bin/env node
/**
 * Diagnose why angloxx/ethersweep/complex-hierarchy are over-counted
 * after PCB expansion.
 */
import path from "node:path";
import fs from "node:fs";

const CORPUS = path.resolve("fixtures/corpus");

// Replicate countPcbGndPads with name matching
function countPcbGndPads(projectDir, proName) {
  const padCounts = new Map();
  let entries;
  try { entries = fs.readdirSync(projectDir); } catch { return padCounts; }
  let pcbFiles;
  if (proName) {
    const base = proName.replace(/\.kicad_pro$/i, "");
    const matched = entries.filter(n => n.toLowerCase() === `${base.toLowerCase()}.kicad_pcb`);
    if (matched.length) {
      pcbFiles = matched.map(n => path.join(projectDir, n));
    } else {
      return padCounts;
    }
  } else {
    pcbFiles = entries.filter(n => n.endsWith(".kicad_pcb")).map(n => path.join(projectDir, n));
  }
  for (const pcbPath of pcbFiles) {
    let src;
    try { src = fs.readFileSync(pcbPath, "utf8"); } catch { continue; }
    let i = 0;
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
      const padRe = /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,500}?\(net\s+\d+\s+"([^"]*)"\)/g;
      let pm;
      while ((pm = padRe.exec(block))) {
        if (pm[2] === "GND") {
          const key = `${refdes}.${pm[1]}`;
          padCounts.set(key, (padCounts.get(key) || 0) + 1);
        }
      }
      i = end;
    }
  }
  return padCounts;
}

const { parseKicadProjectDir } = await import("../workers/parser/src/index.ts");

for (const board of ["angloxx", "ethersweep", "kicad-demo-complex-hierarchy"]) {
  console.log(`\n=== ${board} ===`);
  const dir = path.join(CORPUS, board);
  
  // Find pros
  const walk = (d, depth = 0) => {
    const out = [];
    if (depth > 3) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...walk(p, depth + 1));
      else if (e.name.endsWith(".kicad_pro")) out.push(p);
    }
    return out;
  };
  const pros = walk(dir);
  
  let totalExpanded = 0;
  for (const pro of pros) {
    const proDir = path.dirname(pro);
    const proName = path.basename(pro);
    const snap = parseKicadProjectDir(proDir);
    const gnd = snap.nets.find(n => n.name === "GND");
    const before = gnd ? gnd.nodes.length : 0;
    totalExpanded += before;
    
    const padCounts = countPcbGndPads(proDir, proName);
    let totalPcbPads = 0;
    for (const [, count] of padCounts) totalPcbPads += count;
    
    const schematicNodes = new Set(gnd ? gnd.nodes : []);
    let pcbOnly = 0;
    for (const [key] of padCounts) {
      if (!schematicNodes.has(key)) pcbOnly++;
    }
    
    console.log(`  ${proName}: sch=${before} pcb_total=${totalPcbPads} padCounts.size=${padCounts.size} pcbOnly=${pcbOnly}`);
  }
  console.log(`  TOTAL expanded: ${totalExpanded}`);
  
  // What's the oracle truth?
  const walkPcb = (d, depth = 0) => {
    const out = [];
    if (depth > 3) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...walkPcb(p, depth + 1));
      else if (e.name.endsWith(".kicad_pcb")) out.push(p);
    }
    return out;
  };
  const pcbs = walkPcb(dir);
  let truth = 0;
  for (const pcb of pcbs) {
    const src = fs.readFileSync(pcb, "utf8");
    const re = /\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;
    let m;
    while ((m = re.exec(src))) if (m[1] === "GND") truth++;
  }
  console.log(`  Oracle truth: ${truth}`);
}
