import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const cli = path.join(repoRoot, "packages/cli/bin/solderlab.mjs");

test("solderlab audit runs B1–B5 on blinky; pin functions stay unverifiable", () => {
  const fixture = path.join(repoRoot, "fixtures/kicad/blinky/r2");
  assert.ok(fs.existsSync(fixture), "blinky r2 fixture missing");
  const r = spawnSync(
    process.execPath,
    [cli, "audit", "--dir", fixture, "--cwd", repoRoot],
    {
      encoding: "utf8",
      cwd: path.join(repoRoot, "packages/cli"),
      env: process.env,
    },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout) as {
    substitutions: unknown[];
    decoupling: { gaps: unknown[]; rails: unknown[] };
    testPoints: { uncovered: unknown[]; covered: unknown[] };
    netNames: { anonymous: unknown[] };
    pinFunctions: { status: string; matched: unknown[]; reason: string | null };
  };
  assert.ok(Array.isArray(j.substitutions));
  assert.ok(Array.isArray(j.decoupling.gaps));
  assert.ok(Array.isArray(j.testPoints.uncovered) || Array.isArray(j.testPoints.covered));
  assert.ok(Array.isArray(j.netNames.anonymous));
  assert.equal(j.pinFunctions.status, "unverifiable");
  assert.equal(j.pinFunctions.matched.length, 0);
  assert.match(j.pinFunctions.reason ?? "", /datasheet pin-function table/);
});
