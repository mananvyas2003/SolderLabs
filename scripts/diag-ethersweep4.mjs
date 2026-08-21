// @ts-check
import fs from "node:fs";
import path from "node:path";

const pcbPath = "fixtures/corpus/ethersweep/newer/development/ethersweep402/ethersweep.kicad_pcb";
const src = fs.readFileSync(pcbPath, "utf8");

// The oracle regex from the verifier
const oracleRe = /\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)\)/g;
let oracleCount = 0;
let oracleGndCount = 0;
let m;
while ((m = oracleRe.exec(src))) {
  oracleCount++;
  if (m[1] === "GND") oracleGndCount++;
}
console.log(`Oracle regex total pads: ${oracleCount}`);
console.log(`Oracle regex GND pads: ${oracleGndCount}`);

// Our regex from countPcbGndPads
const ourRe = /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,500}?\(net\s+\d+\s+"([^"]*)"\)\)/g;
let ourCount = 0;
let ourGndCount = 0;
while ((m = ourRe.exec(src))) {
  ourCount++;
  if (m[2] === "GND") ourGndCount++;
}
console.log(`Our regex total pads: ${ourCount}`);
console.log(`Our regex GND pads: ${ourGndCount}`);

// Show first few pad/net pairs
const padNetRe = /\(pad\s+"([^"]*)"[\s\S]{0,700}?\(net\s+(\d+)\s+"([^"]*)"\)/g;
let count = 0;
while ((m = padNetRe.exec(src))) {
  if (count < 5) console.log(`  pad=${m[1]} net=${m[2]} name=${m[3]}`);
  count++;
}
