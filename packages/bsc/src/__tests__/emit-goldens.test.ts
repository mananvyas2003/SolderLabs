import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emitBSC,
  EMIT_FORMATS,
  emitExtension,
  type BoardSupportContract,
} from "../index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "fixtures/corpus/bsc"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

const repoRoot = findRoot(path.resolve(here, "../../.."));
const bscDir = path.join(repoRoot, "fixtures/corpus/bsc");
const emitRoot = path.join(bscDir, "emit");

test("corpus emit goldens match pure emitters for every project × format", () => {
  assert.ok(fs.existsSync(bscDir), "fixtures/corpus/bsc missing");
  const projects = fs
    .readdirSync(bscDir)
    .filter((f) => f.endsWith(".bsc.json"))
    .map((f) => f.replace(/\.bsc\.json$/, ""))
    .sort();
  assert.ok(projects.length >= 1, "no corpus BSC goldens");

  let compared = 0;
  for (const project of projects) {
    const bsc = JSON.parse(
      fs.readFileSync(path.join(bscDir, `${project}.bsc.json`), "utf8"),
    ) as BoardSupportContract;
    for (const fmt of EMIT_FORMATS) {
      const ext = emitExtension(fmt);
      const name = fmt === "kconfig" ? "Kconfig" : `board.${ext}`;
      const goldenPath = path.join(emitRoot, project, name);
      assert.ok(
        fs.existsSync(goldenPath),
        `missing emit golden ${path.relative(repoRoot, goldenPath)} — run npm run golden:emit -w @solderlab/bsc`,
      );
      const expected = fs.readFileSync(goldenPath, "utf8");
      const actual = emitBSC(bsc, fmt);
      assert.equal(
        actual,
        expected,
        `emit mismatch ${project}/${fmt}`,
      );
      compared++;
    }
  }
  console.log(`\ncompared ${compared} emitter goldens across ${projects.length} projects`);
});
