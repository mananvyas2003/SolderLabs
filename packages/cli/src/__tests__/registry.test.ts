import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hashFile,
  resolveRegistryDir,
  portableRegistryDir,
} from "../registry.ts";

test("SOLDERLAB_BSC_DIR wins over lockfile registryDir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-reg-"));
  const envDir = path.join(tmp, "from-env");
  const lockDir = path.join(tmp, "from-lock");
  fs.mkdirSync(envDir);
  fs.mkdirSync(lockDir);
  fs.writeFileSync(path.join(envDir, "board.bsc.json"), "{}");
  fs.writeFileSync(path.join(lockDir, "other.bsc.json"), "{}");

  const prev = process.env.SOLDERLAB_BSC_DIR;
  process.env.SOLDERLAB_BSC_DIR = envDir;
  try {
    const resolved = resolveRegistryDir(tmp, {
      lockRegistryDir: "D:\\Github for Hardware\\fixtures\\corpus\\bsc",
    });
    assert.equal(path.resolve(resolved), path.resolve(envDir));
  } finally {
    if (prev === undefined) delete process.env.SOLDERLAB_BSC_DIR;
    else process.env.SOLDERLAB_BSC_DIR = prev;
  }
});

test("hashFile changes when file bytes change", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-hash-"));
  const f = path.join(tmp, "x.bsc.json");
  fs.writeFileSync(f, JSON.stringify({ a: 1 }));
  const h1 = hashFile(f);
  fs.writeFileSync(f, JSON.stringify({ a: 2 }));
  const h2 = hashFile(f);
  assert.notEqual(h1, h2);
  assert.equal(h1.length, 64);
});

test("portableRegistryDir never emits absolute Windows paths", () => {
  const cwd = process.cwd();
  const abs = "D:\\Github for Hardware\\fixtures\\corpus\\bsc";
  const out = portableRegistryDir(cwd, abs);
  assert.equal(out.includes(":\\"), false);
  assert.ok(out === "" || !path.isAbsolute(out));
});
