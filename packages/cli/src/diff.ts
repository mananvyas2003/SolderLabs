import path from "node:path";
import { parseKicadProjectDir, parseKicadPcbProjectDir } from "@solderlab/parser";
import {
  attachPcbToDiff,
  diffSnapshots,
  findUnintendedConnectivity,
} from "@solderlab/design-core";
import { arg, flag } from "./args";

/**
 * Local pre-upload diff — never sends files anywhere.
 * `solderlab diff --base <dir> --head <dir> [--message "..."] [--json]`
 */
export async function cmdDiff(argv: string[], cwd: string): Promise<number> {
  const baseArg = arg(argv, "base");
  const headArg = arg(argv, "head");
  const message = arg(argv, "message", "") ?? "";
  const asJson = flag(argv, "json");

  if (!baseArg || !headArg) {
    console.error(
      "Usage: solderlab diff --base <kicad-project-dir> --head <kicad-project-dir> [--message msg] [--json]",
    );
    console.error(
      "Parses locally and prints identity-stable diff. Nothing is uploaded.",
    );
    return 1;
  }

  const baseDir = path.resolve(cwd, baseArg);
  const headDir = path.resolve(cwd, headArg);

  let baseSnap;
  let headSnap;
  try {
    baseSnap = parseKicadProjectDir(baseDir);
    headSnap = parseKicadProjectDir(headDir);
  } catch (e) {
    console.error("Parse failed:", (e as Error).message ?? e);
    return 1;
  }

  let diff = diffSnapshots(baseSnap, headSnap, {
    baseRevisionId: "local-base",
    headRevisionId: "local-head",
  });

  const basePcb = parseKicadPcbProjectDir(baseDir);
  const headPcb = parseKicadPcbProjectDir(headDir);
  if (basePcb || headPcb) {
    diff = attachPcbToDiff(diff, basePcb, headPcb);
  }

  const unintended = findUnintendedConnectivity(diff, message || null);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          summary: diff.summary,
          components: diff.components.filter((c) => c.kind !== "unchanged"),
          nets: diff.nets.filter((n) => n.kind !== "unchanged"),
          bom: diff.bom.filter((b) => b.kind !== "unchanged"),
          electrical: diff.electrical,
          unintendedConnectivity: unintended,
          uploaded: false,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("SolderLab local diff (nothing uploaded)");
    console.log(`  base  ${baseDir}`);
    console.log(`  head  ${headDir}`);
    console.log("");
    const s = diff.summary;
    console.log(
      `components +${s.componentsAdded}/-${s.componentsRemoved}/~${s.componentsChanged}  bom ${s.bomChanged}  nets +${s.netsAdded}/-${s.netsRemoved}/~${s.netsChanged}`,
    );
    if (s.electricalGate) {
      console.log(
        `electrical gate=${s.electricalGate}  significant=${s.significantElectrical ?? 0}  critical=${s.criticalElectrical ?? 0}`,
      );
    }
    const changed = diff.components.filter((c) => c.kind !== "unchanged");
    if (changed.length) {
      console.log("");
      console.log("components");
      for (const c of changed.slice(0, 40)) {
        console.log(
          `  ${c.kind.padEnd(14)} ${c.refdes}${c.fields?.length ? `  [${c.fields.join(",")}]` : ""}`,
        );
      }
      if (changed.length > 40) console.log(`  … ${changed.length - 40} more`);
    }
    if (unintended.length) {
      console.log("");
      console.log(`unintended connectivity (${unintended.length})`);
      for (const u of unintended.slice(0, 30)) {
        console.log(`  ! ${u.message}`);
      }
    } else if (message) {
      console.log("");
      console.log("unintended connectivity: none (message covers net changes)");
    } else {
      console.log("");
      console.log(
        "tip: pass --message \"…\" to flag net membership changes the message doesn't acknowledge",
      );
    }
  }

  const critical = (diff.summary.criticalElectrical ?? 0) > 0;
  const gateFail = diff.summary.electricalGate === "FAIL";
  if (critical || gateFail || unintended.length > 0) {
    return 1;
  }
  return 0;
}
