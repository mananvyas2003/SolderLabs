import fs from "node:fs";
import path from "node:path";

const CORPUS = path.join(process.cwd(), "fixtures/corpus");
const { parseKicadProjectDir, discoverProjectRoots } = await import(
  new URL(`file://${path.join(process.cwd(), "workers/parser/src/index.ts")}`).href
);

const boards = fs.readdirSync(CORPUS).filter((d) => {
  try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; }
});

for (const b of boards) {
  const dir = path.join(CORPUS, b);
  let snap;
  try { snap = parseKicadProjectDir(dir); } catch (e) { continue; }
  const pros = discoverProjectRoots(dir);
  // nets whose name mentions GND
  const gndNets = (snap.nets || []).filter((n) => /GND/i.test(n.name)).sort((a, b) => b.nodes.length - a.nodes.length);
  const totalGnd = gndNets.reduce((s, n) => s + n.nodes.length, 0);
  console.log(`\n=== ${b} (${pros.length} pros) totalGndLike=${totalGnd}`);
  for (const n of gndNets.slice(0, 6)) {
    console.log(`   ${n.name} (${n.nodes.length}): ${n.nodes.slice(0, 8).join(", ")}`);
  }
}
