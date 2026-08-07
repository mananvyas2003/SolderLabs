import type { BoardSupportContract } from "../types";
import { isNamedSignal, rustDocComment, toIdent } from "./common";

/** Rust module of `pub const` pin / rail definitions. */
export function emitRust(bsc: BoardSupportContract): string {
  const lines: string[] = [
    rustDocComment(bsc, "rust"),
    "",
    `//! Board Support Contract — ${bsc.boardName}`,
    `#![allow(non_upper_case_globals)]`,
    "",
    `pub const SOLDERLAB_BSC_VERSION: &str = "${bsc.schemaVersion}";`,
    `pub const BOARD_NAME: &str = "${bsc.boardName.replace(/"/g, '\\"')}";`,
    "",
  ];

  if (bsc.mcus[0]) {
    const m = bsc.mcus[0];
    lines.push(`pub mod mcu {`);
    lines.push(`    pub const REFDES: &str = "${m.refdes}";`);
    if (m.mpn) lines.push(`    pub const MPN: &str = "${m.mpn.replace(/"/g, '\\"')}";`);
    lines.push(`}`, "");
  }

  lines.push(`pub mod pins {`);
  const used = new Set<string>();
  for (const p of bsc.pins) {
    const base = p.pinName && p.pinName !== "~"
      ? toIdent(p.pinName, "PIN")
      : isNamedSignal(p.net)
        ? toIdent(p.net!, "NET")
        : toIdent(`P${p.pinNumber}`, "PIN");
    let name = base;
    if (used.has(name)) name = `${base}_${p.pinNumber}`;
    used.add(name);
    lines.push(`    /// ${p.mcuRefdes} pad ${p.pinNumber}${p.net ? ` → ${p.net}` : ""}`);
    lines.push(`    pub const ${name}: u16 = ${Number(p.pinNumber) || 0};`);
  }
  lines.push(`}`, "");

  lines.push(`pub mod rails {`);
  for (const r of bsc.powerRails) {
    const name = toIdent(r.name, "RAIL");
    if (r.nominalVolts == null) {
      lines.push(`    // ${name}: voltage unknown`);
    } else {
      lines.push(
        `    pub const ${name}_MV: u32 = ${Math.round(r.nominalVolts * 1000)};`,
      );
    }
  }
  lines.push(`}`, "");

  lines.push(`pub mod i2c {`);
  for (const d of bsc.busDevices.filter((x) => x.bus === "i2c")) {
    const name = toIdent(d.refdes, "DEV");
    if (d.address == null) {
      lines.push(`    // ${name}: address unknown`);
    } else {
      lines.push(`    pub const ${name}_ADDR: u8 = ${d.address};`);
    }
  }
  lines.push(`}`, "");

  return lines.join("\n");
}
