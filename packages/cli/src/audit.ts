import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "@solderlab/parser";
import {
  auditDecoupling,
  auditNetNames,
  auditSubstitutions,
  auditTestPointCoverage,
  cloneSnapshot,
  type BomPlatformMeta,
} from "@solderlab/design-core";
import {
  generateBSC,
  lookupPinFunctions,
  type PinFunctionRecord,
} from "@solderlab/bsc";
import { arg } from "./args";

function loadJsonArray(filePath: string, label: string): unknown[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`${label} not found: ${abs}`);
  }
  const data = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return data;
}

/**
 * B1–B5 board audits. Nothing is uploaded. No CAD writes.
 * Pin functions stay unverifiable unless --pin-functions is a table.
 */
export async function cmdAudit(argv: string[], cwd: string): Promise<number> {
  const dirArg = arg(argv, "dir") ?? arg(argv, "head");
  if (!dirArg) {
    console.error(
      "Usage: solderlab audit --dir <kicad-dir> [--bom-platform file] [--pin-functions file]",
    );
    return 1;
  }

  const headDir = path.resolve(cwd, dirArg);
  let snap;
  try {
    snap = parseKicadProjectDir(headDir);
  } catch (e) {
    console.error("Parse failed:", (e as Error).message ?? e);
    return 1;
  }

  let platform: BomPlatformMeta[] = [];
  let pinTable: PinFunctionRecord[] | null = null;
  const platformArg = arg(argv, "bom-platform");
  const pinArg = arg(argv, "pin-functions");
  try {
    if (platformArg) {
      platform = loadJsonArray(
        path.resolve(cwd, platformArg),
        "bom-platform",
      ) as BomPlatformMeta[];
    }
    if (pinArg) {
      pinTable = loadJsonArray(
        path.resolve(cwd, pinArg),
        "pin-functions",
      ) as PinFunctionRecord[];
    }
  } catch (e) {
    console.error((e as Error).message ?? e);
    return 1;
  }

  const bsc = generateBSC(cloneSnapshot(snap), {
    boardName: path.basename(headDir),
    revisionId: "head",
  });

  console.log(
    JSON.stringify(
      {
        substitutions: auditSubstitutions(snap, platform),
        decoupling: auditDecoupling(snap),
        testPoints: auditTestPointCoverage(snap),
        netNames: auditNetNames(snap),
        pinFunctions: lookupPinFunctions(bsc, pinTable),
      },
      null,
      2,
    ),
  );
  return 0;
}
