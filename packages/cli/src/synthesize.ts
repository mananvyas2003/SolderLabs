import path from "node:path";
import { parseKicadProjectDir } from "@solderlab/parser";
import {
  cloneSnapshot,
  diffSnapshots,
  generateChangelog,
  generateCommitNotes,
  generateReviewSynthesis,
} from "@solderlab/design-core";
import { diffBSC, generateBSC, generateBringUpScript } from "@solderlab/bsc";
import { arg } from "./args";

/**
 * A2–A5: bring-up, review synthesis, changelog, commit notes.
 * All copied from the engine. Nothing is uploaded. No CAD writes.
 */
export async function cmdSynthesize(argv: string[], cwd: string): Promise<number> {
  const baseArg = arg(argv, "base");
  const headArg = arg(argv, "head") ?? arg(argv, "dir");
  if (!headArg) {
    console.error(
      "Usage: solderlab synthesize --head <kicad-dir> [--base <kicad-dir>]",
    );
    return 1;
  }

  const headDir = path.resolve(cwd, headArg);
  let headSnap;
  try {
    headSnap = parseKicadProjectDir(headDir);
  } catch (e) {
    console.error("Parse failed:", (e as Error).message ?? e);
    return 1;
  }

  const headBsc = generateBSC(cloneSnapshot(headSnap), {
    boardName: path.basename(headDir),
    revisionId: "head",
  });
  const bringup = generateBringUpScript(headBsc);

  if (!baseArg) {
    console.log(JSON.stringify({ bringup }, null, 2));
    return 0;
  }

  const baseDir = path.resolve(cwd, baseArg);
  let baseSnap;
  try {
    baseSnap = parseKicadProjectDir(baseDir);
  } catch (e) {
    console.error("Parse failed:", (e as Error).message ?? e);
    return 1;
  }

  const diff = diffSnapshots(baseSnap, headSnap, {
    baseRevisionId: "local-base",
    headRevisionId: "local-head",
  });
  const baseBsc = generateBSC(cloneSnapshot(baseSnap), {
    boardName: path.basename(baseDir),
    revisionId: "base",
  });
  const bscChanges = diffBSC(baseBsc, headBsc);
  const review = generateReviewSynthesis(diff);
  const changelog = generateChangelog(diff, { bscChanges });
  const commit = generateCommitNotes(diff, { bscChanges });

  console.log(
    JSON.stringify(
      {
        bringup,
        review,
        changelog,
        commit,
      },
      null,
      2,
    ),
  );
  return 0;
}
