#!/usr/bin/env node
/**
 * For each failing board, compare the PCB GND pads to the schematic GND nodes
 * on a per-footprint basis to see what's missed.
 */
import path from "node:path";
import fs from "node:fs";

const CORPUS = path.resolve("fixtures/corpus");

function findPcbs(dir) {
  const out = [];
  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".kicad_pcb")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function parsePcbGndPads(pcbPath) {
  const src = fs.readFileSync(pcbPath, "utf8");
  // Parse footprint blocks to get refdes and pad info
  const results = new Map(); // refdes -> [{ pad, x, y }]
  const footprintRe = /\(footprint\s+"([^"]*)"[\s\S]*?\n\s+\(fp_text reference\s+"([^"]*)"[\s\S]*?\(at\s+([-\d.]+)\s+([-\d.]+)/g;
  let fm;
  while ((fm = footprintRe.exec(src))) {
    const footprint = fm[1];
    const refdes = fm[2];
    // Find pads within this footprint block
    const start = fm.index;
    // Find the closing paren of this footprint
    let depth = 0, end = start;
    for (let i = start; i < src.length && i < start + 50000; i++) {
      if (src[i] === '(') depth++;
      if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const block = src.slice(start, end + 1);
    const padRe = /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,500}?\(net\s+\d+\s+"([^"]*)"\)/g;
    let pm;
    const pads = [];
    while ((pm = padRe.exec(block))) {
      pads.push({ pad: pm[1], net: pm[2] });
    }
    if (!results.has(refdes)) results.set(refdes, { footprint, pads: [] });
    results.get(refdes).pads.push(...pads);
  }
  return results;
}

// Parse schematic GND nodes
const { parseKicadProjectDir } = await import("../workers/parser/src/index.ts");

for (const board of ["piantor", "sprig"]) {
  console.log(`\n=== ${board} ===`);
  const dir = path.join(CORPUS, board);
  
  if (board === "piantor") {
    // Focus on one board (newer/left)
    const pro = path.join(dir, "newer/left/keyboard_pcb.kicad_pro");
    const proDir = path.dirname(pro);
    const snap = parseKicadProjectDir(proDir);
    const gnd = (snap.nets || []).find(n => n.name === "GND");
    const schNodes = new Set(gnd ? gnd.nodes : []);
    console.log(`Schematic GND nodes (${schNodes.size}):`, [...schNodes].sort().join(", "));
    
    const pcb = path.join(proDir, "keyboard_pcb.kicad_pcb");
    const pads = parsePcbGndPads(pcb);
    const allPcbGndPads = [];
    for (const [refdes, info] of pads) {
      const gndPads = info.pads.filter(p => p.net === "GND");
      if (gndPads.length) {
        allPcbGndPads.push({ refdes, footprint: info.footprint, pads: gndPads });
      }
    }
    console.log(`\nPCB GND pads by footprint:`);
    let totalPcbPads = 0;
    for (const { refdes, footprint, pads } of allPcbGndPads) {
      totalPcbPads += pads.length;
      const inSch = schNodes.has(`${refdes}.${pads[0].pad}`) || [...schNodes].some(n => n.startsWith(refdes + "."));
      console.log(`  ${refdes.padEnd(6)} ${footprint.padEnd(45)} GND pads: ${pads.map(p => p.pad).join(", ")}  in_sch: ${inSch}`);
    }
    console.log(`Total PCB GND pads: ${totalPcbPads}, Schematic GND nodes: ${schNodes.size}`);
    
    // Show what's in PCB but not in schematic
    const missing = [];
    for (const { refdes, pads } of allPcbGndPads) {
      for (const p of pads) {
        if (!schNodes.has(`${refdes}.${p.pad}`)) {
          missing.push(`${refdes}.${p.pad}`);
        }
      }
    }
    console.log(`\nIn PCB but not schematic (${missing.length}):`, missing.sort().join(", "));
    
  } else {
    // sprig
    const snap = parseKicadProjectDir(dir);
    const gnd = (snap.nets || []).find(n => n.name === "GND");
    const schNodes = new Set(gnd ? gnd.nodes : []);
    console.log(`Schematic GND nodes (${schNodes.size}):`, [...schNodes].sort().join(", "));
    
    const pcbs = findPcbs(dir);
    const pcb = pcbs[0];
    const pads = parsePcbGndPads(pcb);
    const allPcbGndPads = [];
    for (const [refdes, info] of pads) {
      const gndPads = info.pads.filter(p => p.net === "GND");
      if (gndPads.length) {
        allPcbGndPads.push({ refdes, footprint: info.footprint, pads: gndPads });
      }
    }
    console.log(`\nPCB GND pads by footprint:`);
    let totalPcbPads = 0;
    for (const { refdes, footprint, pads } of allPcbGndPads) {
      totalPcbPads += pads.length;
      const inSch = [...schNodes].some(n => n.startsWith(refdes + "."));
      console.log(`  ${refdes.padEnd(6)} ${footprint.padEnd(45)} GND pads: ${pads.map(p => p.pad).join(", ")}  in_sch: ${inSch}`);
    }
    console.log(`Total PCB GND pads: ${totalPcbPads}, Schematic GND nodes: ${schNodes.size}`);
    
    const missing = [];
    for (const { refdes, pads } of allPcbGndPads) {
      for (const p of pads) {
        if (!schNodes.has(`${refdes}.${p.pad}`)) {
          missing.push(`${refdes}.${p.pad}`);
        }
      }
    }
    console.log(`\nIn PCB but not schematic (${missing.length}):`, missing.sort().join(", "));
  }
}
