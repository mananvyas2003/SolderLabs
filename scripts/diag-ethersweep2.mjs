// @ts-check
import { parseKicadProject } from "../workers/parser/src/index.ts";
import fs from "node:fs";
import path from "node:path";

const corpus = "fixtures/corpus/ethersweep";

function findPros(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findPros(p));
    else if (ent.name.endsWith(".kicad_pro")) out.push(p);
  }
  return out;
}

const pros = findPros(corpus).sort();

let total = 0;

for (const pro of pros) {
  const snap = parseKicadProject(pro);
  const gnd = snap.nets.find((n) => n.name === "GND");
  const nodeCount = gnd ? gnd.nodes.length : 0;
  console.log(`${path.relative(corpus, pro)}: gnd_nodes=${nodeCount}`);
  total += nodeCount;
}

console.log(`\nTotal nodes: ${total}`);
console.log(`Expected (oracle): 1300`);
console.log(`Overcount: ${((total / 1300 - 1) * 100).toFixed(0)}%`);
