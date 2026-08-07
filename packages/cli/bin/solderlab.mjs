#!/usr/bin/env node
/**
 * SolderLab CLI entry — delegates to TypeScript via tsx.
 * Runs with cwd=packages/cli so dependencies resolve; caller cwd is
 * forwarded as an absolute --cwd.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, "..");
const main = path.join(pkgRoot, "src/main.ts");
const callerCwd = process.cwd();

const forwarded = [...process.argv.slice(2)];
const cwdIdx = forwarded.indexOf("--cwd");
if (cwdIdx >= 0 && forwarded[cwdIdx + 1]) {
  forwarded[cwdIdx + 1] = path.resolve(callerCwd, forwarded[cwdIdx + 1]);
} else {
  forwarded.push("--cwd", callerCwd);
}

// Absolutize common path flags relative to the caller's cwd
for (const flag of ["--out", "--scan", "--registry", "--lock", "--file"]) {
  const i = forwarded.indexOf(flag);
  if (i >= 0 && forwarded[i + 1] && !forwarded[i + 1].startsWith("-")) {
    forwarded[i + 1] = path.resolve(callerCwd, forwarded[i + 1]);
  }
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", main, ...forwarded],
  {
    stdio: "inherit",
    cwd: pkgRoot,
    env: process.env,
  },
);
process.exit(result.status === null ? 1 : result.status);
