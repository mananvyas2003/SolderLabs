/**
 * E2E: firmware consumer fails `bsc check --scan` with exact call sites
 * when an upstream BSC pin is reassigned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BoardSupportContract } from "@solderlab/bsc";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const cli = path.join(repoRoot, "packages/cli/bin/solderlab.mjs");
const glasgowSrc = path.join(repoRoot, "fixtures/corpus/bsc/glasgow.bsc.json");

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("bsc check --scan fails with src/main.c call sites after SDA pin reassignment", () => {
  assert.ok(fs.existsSync(cli), "CLI missing");
  assert.ok(fs.existsSync(glasgowSrc), "glasgow BSC golden missing");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-bsc-e2e-"));
  const registry = path.join(tmp, "registry");
  const consumer = path.join(tmp, "consumer");
  fs.mkdirSync(registry);
  fs.mkdirSync(path.join(consumer, "src"), { recursive: true });
  fs.mkdirSync(path.join(consumer, "include"), { recursive: true });

  // Baseline registry / locked pull
  const baseline = JSON.parse(
    fs.readFileSync(glasgowSrc, "utf8"),
  ) as BoardSupportContract;
  fs.writeFileSync(
    path.join(registry, "glasgow.bsc.json"),
    JSON.stringify(baseline, null, 2),
  );

  fs.writeFileSync(
    path.join(consumer, "src/main.c"),
    `#include "board.h"
int main(void) {
  int sda = SOLDERLAB_PIN_SDA;
  int scl = SOLDERLAB_PIN_SCL;
  return sda + scl;
}
`,
  );

  const pull = runCli(
    [
      "bsc",
      "pull",
      "--board",
      "glasgow",
      "--rev",
      "newer",
      "--out",
      "include",
      "--format",
      "c",
      "--registry",
      registry,
    ],
    consumer,
  );
  assert.equal(pull.status, 0, pull.stderr || pull.stdout);
  assert.ok(
    fs.existsSync(path.join(consumer, "include/board.h")),
    "board.h missing after pull",
  );
  assert.ok(fs.existsSync(path.join(consumer, ".bsc-lock.json")));

  // Upstream breaks SDA pad → different net
  const broken: BoardSupportContract = structuredClone(baseline);
  const sda = broken.pins.find(
    (p) =>
      (p.pinName && /SDA/i.test(p.pinName)) ||
      (p.net && /\bSDA\b/i.test(p.net)),
  );
  assert.ok(sda, "expected an SDA-related pin on glasgow BSC");
  sda.net = "HIJACKED_SDA_NET";
  // Force sha change so lock vs current differs even if hash only differs by content
  broken.generatedFrom = {
    ...broken.generatedFrom,
    sha256: "b".repeat(64),
    revisionId: "e2e-broken-rev",
  };
  broken.revision = "broken";
  fs.writeFileSync(
    path.join(registry, "glasgow.bsc.json"),
    JSON.stringify(broken, null, 2),
  );

  const check = runCli(
    ["bsc", "check", "--scan", "src", "--registry", registry],
    consumer,
  );

  assert.equal(check.status, 1, `expected failure, got:\n${check.stdout}\n${check.stderr}`);
  const out = `${check.stdout}\n${check.stderr}`;
  assert.match(out, /pin_reassigned|breaking/i);
  assert.match(out, /src\/main\.c:\d+/);
  assert.match(out, /SOLDERLAB_PIN_SDA/);
});

test("bsc check exits 0 when registry matches lock", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-bsc-ok-"));
  const registry = path.join(tmp, "registry");
  const consumer = path.join(tmp, "consumer");
  fs.mkdirSync(registry);
  fs.mkdirSync(consumer);
  fs.copyFileSync(glasgowSrc, path.join(registry, "glasgow.bsc.json"));

  const pull = runCli(
    [
      "bsc",
      "pull",
      "--board",
      "glasgow",
      "--rev",
      "newer",
      "--out",
      ".",
      "--format",
      "c",
      "--registry",
      registry,
    ],
    consumer,
  );
  assert.equal(pull.status, 0, pull.stderr || pull.stdout);

  const check = runCli(["bsc", "check", "--registry", registry], consumer);
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.match(check.stdout, /OK/);
});
