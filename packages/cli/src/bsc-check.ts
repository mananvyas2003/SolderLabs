import path from "node:path";
import {
  diffBSC,
  hasBreakingChanges,
  nextBscVersion,
  symbolsForChange,
} from "@solderlab/bsc";
import { track } from "@solderlab/analytics";
import { arg } from "./args";
import {
  defaultRegistryDir,
  loadBoardBsc,
  loadLockedBsc,
  readLockfile,
} from "./registry";
import { scanCallSites } from "./scan";

export async function cmdBscCheck(argv: string[], cwd: string): Promise<number> {
  const scanDir = arg(argv, "scan");
  const lockPath = arg(argv, "lock");
  const registryOverride = arg(argv, "registry");

  let lock;
  try {
    lock = readLockfile(cwd, lockPath);
  } catch (e) {
    console.error(String((e as Error).message ?? e));
    return 1;
  }

  const registryDir = path.resolve(
    registryOverride ?? lock.registryDir ?? defaultRegistryDir(cwd),
  );

  const locked = loadLockedBsc(cwd, lock);
  const current = loadBoardBsc(registryDir, lock.board, "latest");

  const changes = diffBSC(locked, current);
  const breaking = changes.filter((c) => c.severity === "breaking");
  const suggested = nextBscVersion(lock.bscVersion || "1.0.0", changes);

  if (!changes.length) {
    console.log(
      `OK  board=${lock.board}  sha256 unchanged (${lock.sha256.slice(0, 12)}…)`,
    );
    return 0;
  }

  console.log(
    `BSC diff  board=${lock.board}  locked=${lock.sha256.slice(0, 12)}…  current=${current.generatedFrom.sha256.slice(0, 12)}…`,
  );
  console.log(
    `changes=${changes.length}  breaking=${breaking.length}  suggestedSemver=${suggested}`,
  );
  console.log("");
  console.log(
    "severity   kind                      message",
  );
  console.log("-".repeat(90));
  for (const c of changes) {
    console.log(
      `${c.severity.padEnd(10)} ${c.kind.padEnd(25)} ${c.message}`,
    );
  }

  let callSitesFound = 0;
  if (scanDir) {
    const symbols = [
      ...new Set(breaking.flatMap((c) => symbolsForChange(c))),
    ];
    console.log("");
    console.log(`Scanning ${path.resolve(cwd, scanDir)} for ${symbols.length} symbols…`);
    const hits = scanCallSites(path.resolve(cwd, scanDir), symbols);
    callSitesFound = hits.length;
    if (!hits.length) {
      console.log("(no call sites found for breaking-change symbols)");
    } else {
      console.log("");
      console.log("file:line  symbol  source");
      console.log("-".repeat(90));
      for (const h of hits) {
        const rel = path.relative(cwd, h.file).replace(/\\/g, "/");
        console.log(`${rel}:${h.line}  ${h.symbol}  ${h.text}`);
      }
    }
  }

  if (hasBreakingChanges(changes)) {
    track(
      "bsc_check_failed",
      {
        boardId: lock.board,
        breakingChangeCount: breaking.length,
        callSitesFound,
      },
      { orgId: process.env.SOLDERLAB_ORG_ID ?? null },
    );
    console.error("");
    console.error(
      `FAIL  ${breaking.length} breaking BSC change(s)${scanDir ? `, ${callSitesFound} call site(s)` : ""}`,
    );
    return 1;
  }

  console.log("");
  console.log("OK  no breaking changes (additive/compatible only)");
  return 0;
}
