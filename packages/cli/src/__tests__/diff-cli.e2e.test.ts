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

function runDiff(base: string, head: string, message?: string) {
  const args = [
    cli,
    "diff",
    "--base",
    base,
    "--head",
    head,
    "--json",
    "--cwd",
    repoRoot,
  ];
  if (message) args.push("--message", message);
  return spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: path.join(repoRoot, "packages/cli"),
    env: process.env,
  });
}

test("solderlab diff runs locally without upload on blinky r1==r1", () => {
  const fixture = path.join(repoRoot, "fixtures/kicad/blinky/r1");
  assert.ok(fs.existsSync(fixture), "blinky r1 fixture missing");
  const r = runDiff(fixture, fixture, "no-op self diff");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.uploaded, false);
});

test("solderlab diff r1→r2 returns machine-readable summary", () => {
  const base = path.join(repoRoot, "fixtures/kicad/blinky/r1");
  const head = path.join(repoRoot, "fixtures/kicad/blinky/r2");
  assert.ok(fs.existsSync(base) && fs.existsSync(head));
  const r = runDiff(base, head, "LED brightness tweak");
  assert.ok(r.status === 0 || r.status === 1, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.uploaded, false);
  assert.ok(j.summary);
});
