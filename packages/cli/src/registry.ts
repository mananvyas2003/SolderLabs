import fs from "node:fs";
import path from "node:path";
import type { BoardSupportContract } from "@solderlab/bsc";

export interface BscLockfile {
  board: string;
  revision: string;
  schemaVersion: string;
  sha256: string;
  bscVersion: string;
  format: string;
  pulledAt: string;
  registryDir: string;
  lockedBscRel: string;
}

export function defaultRegistryDir(cwd: string): string {
  if (process.env.SOLDERLAB_BSC_DIR) {
    return path.resolve(process.env.SOLDERLAB_BSC_DIR);
  }
  // Walk up looking for corpus BSC goldens
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "fixtures/corpus/bsc");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(cwd, "fixtures/corpus/bsc");
}

export function listBoards(registryDir: string): string[] {
  if (!fs.existsSync(registryDir)) return [];
  return fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith(".bsc.json"))
    .map((f) => f.replace(/\.bsc\.json$/, ""))
    .sort();
}

export function loadBoardBsc(
  registryDir: string,
  board: string,
  rev: string,
): BoardSupportContract {
  const primary = path.join(registryDir, `${board}.bsc.json`);
  const revPath = path.join(registryDir, board, `${rev}.bsc.json`);
  const latestPath = path.join(registryDir, board, "latest.bsc.json");

  let file: string | null = null;
  if (rev !== "latest" && fs.existsSync(revPath)) file = revPath;
  else if (fs.existsSync(primary)) file = primary;
  else if (fs.existsSync(latestPath)) file = latestPath;
  else if (fs.existsSync(revPath)) file = revPath;

  if (!file) {
    const known = listBoards(registryDir);
    throw new Error(
      `Board BSC not found for '${board}' (rev=${rev}) in ${registryDir}. Known: ${known.join(", ") || "(none)"}`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as BoardSupportContract;
}

export function writeLockfile(cwd: string, lock: BscLockfile): void {
  fs.writeFileSync(
    path.join(cwd, ".bsc-lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
  );
}

export function readLockfile(cwd: string, lockPath?: string): BscLockfile {
  const p = lockPath
    ? path.resolve(lockPath)
    : path.join(cwd, ".bsc-lock.json");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing lockfile at ${p} — run: solderlab bsc pull ...`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as BscLockfile;
}

export function loadLockedBsc(cwd: string, lock: BscLockfile): BoardSupportContract {
  const p = path.resolve(cwd, lock.lockedBscRel);
  if (!fs.existsSync(p)) {
    throw new Error(`Locked BSC missing at ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as BoardSupportContract;
}
