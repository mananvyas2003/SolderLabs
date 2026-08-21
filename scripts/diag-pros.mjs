import fs from "node:fs";
import path from "node:path";
const { parseKicadProject } = await import(
  new URL(`file://${path.join(process.cwd(), "workers/parser/src/index.ts")}`).href
);

function findPros(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      findPros(p, out);
    } else if (e.name.endsWith(".kicad_pro")) out.push(p);
  }
  return out;
}

const boards = ["amulet-controller", "angloxx", "ethersweep", "glasgow", "kicad-demo-complex-hierarchy",
  "kicad-demo-vme-wren", "kintex-pcie", "piantor", "sprig", "upsy-desky", "zynq-som"];
for (const b of boards) {
  const dir = path.join("fixtures/corpus", b);
  const pros = findPros(dir);
  console.log(`\n=== ${b} (${pros.length} pros)`);
  for (const pro of pros) {
    try {
      const snap = parseKicadProject(pro);
      const gnd = (snap.nets || []).filter((n) => n.name === "GND");
      const total = gnd.reduce((s, n) => s + n.nodes.length, 0);
      console.log(`   ${path.relative(dir, pro).replace(/\\/g, "/").padEnd(50)} GND-nets=${gnd.length} totalNodes=${total} comps=${snap.components.length}`);
    } catch (e) {
      console.log(`   ${path.relative(dir, pro).replace(/\\/g, "/").padEnd(50)} FAIL: ${String(e).slice(0, 80)}`);
    }
  }
}
