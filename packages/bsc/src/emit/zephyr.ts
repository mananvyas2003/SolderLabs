import type { BoardSupportContract } from "../types";
import { cBlockComment, isNamedSignal, toIdent } from "./common";

/** Zephyr devicetree overlay with pinctrl stubs for named MCU nets. */
export function emitZephyr(bsc: BoardSupportContract): string {
  const mcu = bsc.mcus[0];
  const lines: string[] = [
    cBlockComment(bsc, "zephyr"),
    "",
    `/* Board: ${bsc.boardName} — Zephyr overlay (stub pinctrl from BSC nets) */`,
    "",
    `/ {`,
    `\tchosen {`,
    mcu
      ? `\t\t/* Primary MCU from BSC: ${mcu.refdes} (${mcu.mpn ?? "mpn?"}) */`
      : `\t\t/* No MCU detected in BSC */`,
    `\t};`,
    ``,
    `\tsolderlab_bsc_pins {`,
    `\t\tcompatible = "solderlab,bsc-pins";`,
    `\t\tstatus = "okay";`,
  ];

  const named = bsc.pins.filter((p) => isNamedSignal(p.net));
  for (const p of named.slice(0, 64)) {
    const node = toIdent(p.net!, "PIN").toLowerCase();
    lines.push(`\t\t${node} {`);
    lines.push(`\t\t\tmcu = "${p.mcuRefdes}";`);
    lines.push(`\t\t\tpad = <${p.pinNumber}>;`);
    lines.push(`\t\t\tnet = "${p.net}";`);
    if (p.pinName) lines.push(`\t\t\tpin-name = "${p.pinName}";`);
    lines.push(`\t\t};`);
  }

  lines.push(`\t};`, ``, `\tpinctrl {`);
  if (!named.length) {
    lines.push(`\t\t/* No named nets to map into pinctrl */`);
  } else {
    lines.push(`\t\tsolderlab_default: solderlab_default {`);
    lines.push(`\t\t\tgroup1 {`);
    lines.push(
      `\t\t\t\t/* Pads with named nets — assign SoC pins in board DTS */`,
    );
    for (const p of named.slice(0, 32)) {
      lines.push(
        `\t\t\t\t/* ${p.mcuRefdes}.${p.pinNumber} <-> ${p.net} */`,
      );
    }
    lines.push(`\t\t\t};`, `\t\t};`);
  }
  lines.push(`\t};`, `};`, "");

  return lines.join("\n");
}
