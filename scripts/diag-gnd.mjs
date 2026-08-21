import fs from "node:fs";
import path from "node:path";

const CORPUS = path.join(process.cwd(), "fixtures/corpus");
const { parseKicadProjectDir } = await import(
  new URL(`file://${path.join(process.cwd(), "workers/parser/src/index.ts")}`).href
);

// Same oracle as verify-solderlabs.mjs (copied verbatim from pcbGndPadCount)
const ORACLE_RE = new RegExp(String.raw`\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)`, "g");

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
  try { walk(boardDir); } catch { return null; }
  if (!pcbs.length) return null;
  let count = 0;
  for (const p of pcbs) {
    const src = fs.readFileSync(p, "utf8");
    ORACLE_RE.lastIndex = 0;
    let m;
    while ((m = ORACLE_RE.exec(src))) if (m[1] === "GND") count++;
  }
  return count || null;
}

const boards = fs.readdirSync(CORPUS).filter((d) => {
  try { return fs.statSync(path.join(CORPUS, d)).isDirectory(); } catch { return false; }
});

for (const b of boards) {
  const dir = path.join(CORPUS, b);
  const truth = pcbGndPadCount(dir);
  let snap;
  try { snap = parseKicadProjectDir(dir); } catch (e) {
    console.log(`${b.padEnd(30)} PARSE FAIL: ${String(e).slice(0, 120)}`);
    continue;
  }
  const gnd = (snap.nets || []).find((n) => n.name === "GND");
  const got = gnd ? gnd.nodes.length : 0;
  const err = truth ? ((got - truth) / truth * 100).toFixed(0) : "n/a";
  console.log(
    `${b.padEnd(30)} got=${String(got).padStart(4)} truth=${String(truth ?? 0).padStart(4)} err=${String(err).padStart(5)}% ` +
    `comps=${snap.components.length} nets=${snap.nets.length} sheets=${snap.sheets.length}`
  );
  if (gnd) console.log(`   GND nodes: ${gnd.nodes.slice(0, 10).join(", ")}${gnd.nodes.length > 10 ? " ..." : ""}`);
}
