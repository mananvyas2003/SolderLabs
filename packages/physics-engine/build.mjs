#!/usr/bin/env node
/**
 * Build solderlab-physics with gcc when CMake is unavailable.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(root, "bin");
const outName =
  process.platform === "win32" ? "solderlab-physics.exe" : "solderlab-physics";
const out = path.join(binDir, outName);

fs.mkdirSync(binDir, { recursive: true });

function run(cmd, args, opts = {}) {
  console.log("+", cmd, args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "));
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (r.error) {
    console.error(r.error);
    return 1;
  }
  return r.status ?? 1;
}

const cmake = spawnSync("cmake", ["--version"], { encoding: "utf8", shell: false });
if ((cmake.status ?? 1) === 0) {
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  let code = run("cmake", ["-B", "build", "-S", "."]);
  if (code !== 0) process.exit(code);
  code = run("cmake", ["--build", "build", "--config", "Release"]);
  process.exit(code);
}

const gccCandidates = [
  process.env.CC,
  path.join("D:", "msys64", "mingw64", "bin", "gcc.exe"),
  "gcc",
].filter(Boolean);

let gcc = null;
for (const c of gccCandidates) {
  const r = spawnSync(c, ["--version"], { encoding: "utf8", shell: false });
  if ((r.status ?? 1) === 0) {
    gcc = c;
    break;
  }
}
if (!gcc) {
  console.error("Neither cmake nor gcc found — cannot build solderlab-physics");
  process.exit(1);
}

/* Relative paths — avoid shell splitting on spaces in the monorepo path. */
const sources = [
  "src/json_cli.c",
  "vendor/new_sch/db.c",
  "vendor/new_sch/catalogue.c",
  "vendor/new_sch/jlcparts_import.c",
  "vendor/new_sch/physics.c",
  "vendor/new_sch/ac_physics.c",
  "vendor/new_sch/cJSON.c",
  "vendor/new_sch/sqlite3.c",
];

const args = [
  "-std=c11",
  "-O2",
  "-w",
  "-Ivendor/new_sch",
  ...sources,
  "-o",
  path.join("bin", outName),
];
if (process.platform !== "win32") args.push("-lpthread", "-lm");
else args.push("-lpthread");

const code = run(gcc, args);
if (code === 0) console.log("Built", out);
process.exit(code);
