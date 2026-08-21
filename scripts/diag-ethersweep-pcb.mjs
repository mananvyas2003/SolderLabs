// @ts-check
import fs from "node:fs";
import path from "node:path";

const corpus = "fixtures/corpus/ethersweep";

function findPcbs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findPcbs(p));
    else if (ent.name.endsWith(".kicad_pcb")) out.push(p);
  }
  return out;
}

function countGndPads(pcbPath) {
  const src = fs.readFileSync(pcbPath, "utf8");
  const re = /\(net\s+\d+\s+"GND"\)/g;
  let count = 0;
  while (re.exec(src)) count++;
  return count;
}

const pcbs = findPcbs(corpus).sort();
let total = 0;
for (const pcb of pcbs) {
  const n = countGndPads(pcb);
  console.log(`${path.relative(corpus, pcb)}: GND pads=${n}`);
  total += n;
}
console.log(`\nTotal PCB GND pads: ${total}`);
