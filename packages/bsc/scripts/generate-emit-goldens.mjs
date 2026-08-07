/**
 * Emit golden firmware artifacts for every corpus BSC JSON.
 * Output: fixtures/corpus/bsc/emit/<project>/*.{h,overlay,Kconfig,rs,json}
 */
import fs from "node:fs";
import path from "node:path";
import {
  emitBSC,
  EMIT_FORMATS,
  emitExtension,
} from "../src/index.ts";

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "fixtures/corpus/bsc"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

const repoRoot = findRoot(process.cwd());
const bscDir = path.join(repoRoot, "fixtures/corpus/bsc");
const emitRoot = path.join(bscDir, "emit");

fs.mkdirSync(emitRoot, { recursive: true });

const files = fs
  .readdirSync(bscDir)
  .filter((f) => f.endsWith(".bsc.json"))
  .sort();

for (const file of files) {
  const project = file.replace(/\.bsc\.json$/, "");
  const bsc = JSON.parse(
    fs.readFileSync(path.join(bscDir, file), "utf8"),
  );
  const outDir = path.join(emitRoot, project);
  fs.mkdirSync(outDir, { recursive: true });
  for (const fmt of EMIT_FORMATS) {
    const ext = emitExtension(fmt);
    const name = fmt === "kconfig" ? "Kconfig" : `board.${ext}`;
    const outPath = path.join(outDir, name);
    fs.writeFileSync(outPath, emitBSC(bsc, fmt));
  }
  console.log(
    `${project.padEnd(32)} → emit/${project}/ (${EMIT_FORMATS.length} formats)`,
  );
}

console.log(`\nWrote emitter goldens under ${emitRoot}`);
