import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  generateFirmwarePatch,
  nextBscVersion,
  type FirmwareFile,
} from "@solderlab/bsc";
import { arg, flag } from "./args";
import { cmdBscCheck } from "./bsc-check";
import {
  loadBoardBscWithHash,
  loadLockedBscWithHash,
  portableRegistryDir,
  readLockfile,
  resolveRegistryDir,
  writeLockfile,
  type BscLockfile,
} from "./registry";
import { listFirmwareSourceFiles } from "./scan";

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function collectFirmwareFiles(cwd: string, scanDir: string): FirmwareFile[] {
  const files: FirmwareFile[] = [];
  const seen = new Set<string>();
  const add = (rel: string, contents: string) => {
    const p = posix(rel);
    if (seen.has(p)) return;
    seen.add(p);
    files.push({ path: p, contents });
  };
  for (const abs of listFirmwareSourceFiles(path.resolve(cwd, scanDir))) {
    add(path.relative(cwd, abs), fs.readFileSync(abs, "utf8"));
  }
  const header = path.join(cwd, "include", "board.h");
  if (fs.existsSync(header)) {
    add("include/board.h", fs.readFileSync(header, "utf8"));
  }
  return files;
}

function findCCompiler(): string | null {
  if (process.env.CC && process.env.CC.length) return process.env.CC;
  for (const bin of ["gcc", "clang", "cc"]) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000 });
    if (r.status === 0) return bin;
  }
  return null;
}

function writeTree(root: string, files: FirmwareFile[]): void {
  for (const f of files) {
    const abs = path.join(root, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.contents);
  }
}

function compileFirmware(
  root: string,
  cc: string,
): { ok: boolean; log: string; compiler: string } {
  const src = path.join(root, "src", "main.c");
  if (!fs.existsSync(src)) {
    return { ok: false, log: "src/main.c missing in shadow tree", compiler: cc };
  }
  const out = path.join(root, process.platform === "win32" ? "firmware.exe" : "firmware");
  const r = spawnSync(
    cc,
    ["-std=c11", "-Wall", "-Werror", "-Iinclude", src, "-o", out],
    { encoding: "utf8", timeout: 20000, cwd: root },
  );
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0 && fs.existsSync(out), log, compiler: cc };
}

export async function cmdFirmwarePatch(argv: string[], cwd: string): Promise<number> {
  const scanDir = arg(argv, "scan", "src")!;
  const lockPath = arg(argv, "lock");
  const registryOverride = arg(argv, "registry");
  const apply = flag(argv, "apply");
  const wantCompile = flag(argv, "compile");
  const reportPath = arg(argv, "report");
  const outDirArg = arg(argv, "out-dir");

  let lock;
  try {
    lock = readLockfile(cwd, lockPath);
  } catch (e) {
    console.error(String((e as Error).message ?? e));
    return 1;
  }

  const registryDir = resolveRegistryDir(cwd, {
    override: registryOverride,
    lockRegistryDir: lock.registryDir || undefined,
  });

  const locked = loadLockedBscWithHash(cwd, lock);
  const current = loadBoardBscWithHash(registryDir, lock.board, "latest");
  const files = collectFirmwareFiles(cwd, scanDir);
  const patch = generateFirmwarePatch({
    locked: locked.bsc,
    current: current.bsc,
    files,
  });

  const overlay = new Map(files.map((f) => [f.path, f.contents]));
  for (const f of patch.files) overlay.set(f.path, f.contents);
  const tree = [...overlay.entries()].map(([p, contents]) => ({ path: p, contents }));

  let dest: string | null = null;
  if (apply) dest = cwd;
  else if (outDirArg) dest = path.resolve(cwd, outDirArg);
  else if (wantCompile) {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-fw-shadow-"));
  }

  const report: Record<string, unknown> = {
    status: patch.status,
    coverage: patch.coverage,
    board: lock.board,
    breaking: patch.breaking.map((c) => c.message),
    migrations: patch.migrations,
    withheld: patch.withheld,
    files: patch.files.map((f) => f.path),
    compiled: null,
    compiler: null,
    compileLog: null,
    bscCheck: null,
    shadowDir: dest,
    apply,
  };

  if (dest) {
    writeTree(dest, tree);
    const bscStoreDir = path.join(dest, ".bsc");
    fs.mkdirSync(bscStoreDir, { recursive: true });
    const lockedRel = path.join(".bsc", "locked.bsc.json");
    fs.writeFileSync(
      path.join(dest, lockedRel),
      JSON.stringify(current.bsc, null, 2) + "\n",
    );
    const newLock: BscLockfile = {
      board: lock.board,
      revision: current.bsc.revision ?? lock.revision,
      schemaVersion: current.bsc.schemaVersion,
      sha256: current.sha256,
      bscVersion: nextBscVersion(lock.bscVersion || "1.0.0", patch.changes),
      format: lock.format || "c",
      pulledAt: new Date().toISOString(),
      registryDir: portableRegistryDir(dest, registryDir),
      lockedBscRel: lockedRel.replace(/\\/g, "/"),
    };
    writeLockfile(dest, newLock);

    if (wantCompile) {
      const cc = findCCompiler();
      if (!cc) {
        report.compiled = false;
        report.compileLog = "C compiler not found (set CC or install gcc)";
        if (process.env.CI) {
          console.error(String(report.compileLog));
          return 1;
        }
      } else {
        const compiled = compileFirmware(dest, cc);
        report.compiled = compiled.ok;
        report.compiler = compiled.compiler;
        report.compileLog = compiled.log;
        if (!compiled.ok) {
          console.error(compiled.log);
        }
      }
    }

    const checkArgv = ["--scan", scanDir, "--registry", registryDir];
    const checkCode = await cmdBscCheck(checkArgv, dest);
    report.bscCheck = checkCode === 0 ? "pass" : "fail";
  }

  const json = JSON.stringify(report, null, 2);
  if (reportPath) {
    const abs = path.resolve(cwd, reportPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json + "\n");
  } else {
    console.log(json);
  }

  if (patch.status === "unverifiable") return 1;
  if (report.compiled === false) return 1;
  if (report.bscCheck === "fail") return 1;
  return 0;
}
