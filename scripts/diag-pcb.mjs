import fs from "node:fs";
import path from "node:path";

const re = new RegExp(String.raw`\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)`, "g");
function countPcb(p) {
  const src = fs.readFileSync(p, "utf8");
  re.lastIndex = 0;
  let m, n = 0;
  while ((m = re.exec(src))) if (m[1] === "GND") n++;
  return n;
}

const cases = [
  "amulet-controller", "glasgow", "kintex-pcie", "zynq-som", "ethersweep",
  "piantor", "angloxx", "kicad-demo-complex-hierarchy", "kicad-demo-vme-wren",
  "sprig", "upsy-desky", "microrusefi",
];
for (const name of cases) {
  const dir = path.join("fixtures/corpus", name);
  const files = [];
  (function walk(d, dep = 0) {
    if (dep > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, dep + 1);
      else if (e.name.endsWith(".kicad_pcb")) files.push(p);
    }
  })(dir);
  const per = files.map((f) => `${path.relative(dir, f).replace(/\\/g, "/")}=${countPcb(f)}`);
  console.log(name.padEnd(26), "total=" + per.reduce((s, x) => s + Number(x.split("=")[1]), 0));
  for (const p of per) console.log(`    ${p}`);
}
