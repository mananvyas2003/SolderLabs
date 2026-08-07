import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { BoardSupportContract } from "@solderlab/bsc";

export interface BscLockfile {
  board: string;
  revision: string;
  schemaVersion: string;
  /** sha256 of the locked BSC file bytes (not generatedFrom.sha256) */
  sha256: string;
  bscVersion: string;
  format: string;
  pulledAt: string;
  /**
   * Hint only — never machine-absolute. Prefer env / walk over this when
   * the path does not exist on the current machine.
   */
  registryDir: string;
  lockedBscRel: string;
}

export function hashFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** Walk up from cwd looking for fixtures/corpus/bsc (ignores env). */
export function walkRegistryDir(cwd: string): string {
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

export function defaultRegistryDir(cwd: string): string {
  if (process.env.SOLDERLAB_BSC_DIR) {
    return path.resolve(process.env.SOLDERLAB_BSC_DIR);
  }
  return walkRegistryDir(cwd);
}

/**
 * Resolve registry directory. Priority:
 * 1. --registry CLI override
 * 2. SOLDERLAB_BSC_DIR env (always wins over lockfile)
 * 3. Walk from cwd for fixtures/corpus/bsc
 * 4. lock.registryDir only if it exists on this machine
 */
export function resolveRegistryDir(
  cwd: string,
  opts: { override?: string; lockRegistryDir?: string } = {},
): string {
  if (opts.override) return path.resolve(cwd, opts.override);
  if (process.env.SOLDERLAB_BSC_DIR) {
    return path.resolve(process.env.SOLDERLAB_BSC_DIR);
  }
  const walked = walkRegistryDir(cwd);
  if (fs.existsSync(walked)) return walked;
  if (opts.lockRegistryDir) {
    const locked = path.resolve(opts.lockRegistryDir);
    if (fs.existsSync(locked)) return locked;
  }
  return walked;
}

/** Prefer a portable relative path (or empty) when writing lockfiles. */
export function portableRegistryDir(cwd: string, absRegistry: string): string {
  const walked = walkRegistryDir(cwd);
  if (path.resolve(absRegistry) === path.resolve(walked)) {
    // Empty means “discover via walk / SOLDERLAB_BSC_DIR”
    return "";
  }
  const rel = path.relative(cwd, absRegistry);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  // Never persist machine-absolute paths
  return "";
}

export function listBoards(registryDir: string): string[] {
  if (!fs.existsSync(registryDir)) return [];
  return fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith(".bsc.json"))
    .map((f) => f.replace(/\.bsc\.json$/, ""))
    .sort();
}

export function resolveBoardBscPath(
  registryDir: string,
  board: string,
  rev: string,
): string {
  const primary = path.join(registryDir, `${board}.bsc.json`);
  const revPath = path.join(registryDir, board, `${rev}.bsc.json`);
  const latestPath = path.join(registryDir, board, "latest.bsc.json");

  if (rev !== "latest" && fs.existsSync(revPath)) return revPath;
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(latestPath)) return latestPath;
  if (fs.existsSync(revPath)) return revPath;

  const known = listBoards(registryDir);
  throw new Error(
    `Board BSC not found for '${board}' (rev=${rev}) in ${registryDir}. Known: ${known.join(", ") || "(none)"}`,
  );
}

export function loadBoardBsc(
  registryDir: string,
  board: string,
  rev: string,
): BoardSupportContract {
  const file = resolveBoardBscPath(registryDir, board, rev);
  return JSON.parse(fs.readFileSync(file, "utf8")) as BoardSupportContract;
}

export function loadBoardBscWithHash(
  registryDir: string,
  board: string,
  rev: string,
): { bsc: BoardSupportContract; filePath: string; sha256: string } {
  const filePath = resolveBoardBscPath(registryDir, board, rev);
  const sha256 = hashFile(filePath);
  const bsc = JSON.parse(fs.readFileSync(filePath, "utf8")) as BoardSupportContract;
  return { bsc, filePath, sha256 };
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

export function loadLockedBscWithHash(
  cwd: string,
  lock: BscLockfile,
): { bsc: BoardSupportContract; filePath: string; sha256: string } {
  const filePath = path.resolve(cwd, lock.lockedBscRel);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Locked BSC missing at ${filePath}`);
  }
  return {
    bsc: JSON.parse(fs.readFileSync(filePath, "utf8")) as BoardSupportContract,
    filePath,
    sha256: hashFile(filePath),
  };
}
