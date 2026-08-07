import fs from "node:fs";
import path from "node:path";
import {
  emitBSC,
  emitExtension,
  type EmitFormat,
} from "@solderlab/bsc";
import { track } from "@solderlab/analytics";
import { arg } from "./args";
import {
  defaultRegistryDir,
  loadBoardBscWithHash,
  portableRegistryDir,
  writeLockfile,
  type BscLockfile,
} from "./registry";

const FORMATS = new Set(["c", "zephyr", "rust", "json", "kconfig"]);

export async function cmdBscPull(argv: string[], cwd: string): Promise<number> {
  const board = arg(argv, "board");
  const rev = arg(argv, "rev", "latest")!;
  const outDir = path.resolve(cwd, arg(argv, "out", ".")!);
  const format = (arg(argv, "format", "c") ?? "c") as EmitFormat;
  const registryDir = path.resolve(
    arg(argv, "registry", defaultRegistryDir(cwd))!,
  );

  if (!board) {
    console.error(
      "Usage: solderlab bsc pull --board <slug> --rev <rev|latest> --out <dir> --format c|zephyr|rust|json",
    );
    return 1;
  }
  if (!FORMATS.has(format)) {
    console.error(`Unknown format '${format}'. Use: c|zephyr|rust|json|kconfig`);
    return 1;
  }

  const { bsc, sha256 } = loadBoardBscWithHash(registryDir, board, rev);
  fs.mkdirSync(outDir, { recursive: true });

  const ext = emitExtension(format);
  const fileName = format === "kconfig" ? "Kconfig" : `board.${ext}`;
  const outFile = path.join(outDir, fileName);
  fs.writeFileSync(outFile, emitBSC(bsc, format));

  const bscStoreDir = path.join(cwd, ".bsc");
  fs.mkdirSync(bscStoreDir, { recursive: true });
  const lockedRel = path.join(".bsc", "locked.bsc.json");
  const lockedAbs = path.join(cwd, lockedRel);
  fs.writeFileSync(lockedAbs, JSON.stringify(bsc, null, 2) + "\n");

  const lock: BscLockfile = {
    board,
    revision: rev === "latest" ? (bsc.revision ?? "latest") : rev,
    schemaVersion: bsc.schemaVersion,
    // File hash of the pulled registry artifact (recomputed over locked copy)
    sha256,
    bscVersion: "1.0.0",
    format,
    pulledAt: new Date().toISOString(),
    registryDir: portableRegistryDir(cwd, registryDir),
    lockedBscRel: lockedRel.replace(/\\/g, "/"),
  };
  writeLockfile(cwd, lock);

  track(
    "bsc_pulled",
    {
      boardId: board,
      format,
      ciContext: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
    },
    { orgId: process.env.SOLDERLAB_ORG_ID ?? null },
  );

  console.log(`Pulled BSC board=${board} rev=${lock.revision}`);
  console.log(`  emitted  ${path.relative(cwd, outFile) || outFile}`);
  console.log(`  lockfile .bsc-lock.json`);
  console.log(`  sha256   ${lock.sha256.slice(0, 16)}…`);
  return 0;
}
