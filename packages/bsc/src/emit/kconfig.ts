import type { BoardSupportContract } from "../types";
import { hashComment, toIdent } from "./common";

/** Kconfig fragment with board / revision / rail symbols. */
export function emitKconfig(bsc: BoardSupportContract): string {
  const board = toIdent(bsc.boardName, "BOARD");
  const lines: string[] = [
    hashComment(bsc, "kconfig"),
    "",
    `config SOLDERLAB_BOARD_${board}`,
    `\tbool "SolderLab board ${bsc.boardName}"`,
    `\tdefault y`,
    `\thelp`,
    `\t  Auto-generated from Board Support Contract.`,
    "",
  ];

  if (bsc.revision) {
    const rev = toIdent(bsc.revision, "REV");
    lines.push(
      `config SOLDERLAB_BOARD_REV_${rev}`,
      `\tbool "Board revision ${bsc.revision}"`,
      `\tdefault y`,
      "",
    );
  } else {
    lines.push(
      `# revision unknown — no SOLDERLAB_BOARD_REV_* symbol emitted`,
      "",
    );
  }

  for (const strap of bsc.revStraps) {
    if (!strap.gpio) continue;
    const sym = toIdent(strap.gpio, "STRAP");
    lines.push(
      `config SOLDERLAB_REV_STRAP_${sym}`,
      `\tbool "Rev strap GPIO ${strap.gpio}"`,
      `\tdefault y`,
      `\thelp`,
      `\t  Expected level / decode unknown in BSC — configure in firmware.`,
      "",
    );
  }

  for (const r of bsc.powerRails) {
    if (r.nominalVolts == null) continue;
    const sym = toIdent(r.name, "RAIL");
    lines.push(
      `config SOLDERLAB_RAIL_${sym}_MV`,
      `\tint "Rail ${r.name} millivolts"`,
      `\tdefault ${Math.round(r.nominalVolts * 1000)}`,
      "",
    );
  }

  return lines.join("\n");
}
