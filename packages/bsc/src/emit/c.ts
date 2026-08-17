import type { BoardSupportContract, BscBusDevice, BscPin, BscPowerRail } from "../types";
import { cBlockComment, isNamedSignal, toIdent } from "./common";

export interface PinMacro {
  pin: BscPin;
  macro: string;
}

/** Same naming rules as emitC. Uniqueness is over the whole pin list. */
export function assignPinMacros(bsc: BoardSupportContract): PinMacro[] {
  const used = new Set<string>();
  const out: PinMacro[] = [];
  for (const p of bsc.pins) {
    const base = p.pinName && p.pinName !== "~"
      ? toIdent(p.pinName, "PIN")
      : isNamedSignal(p.net)
        ? toIdent(p.net!, "NET")
        : toIdent(`${p.mcuRefdes}_P${p.pinNumber}`, "PIN");
    let name = `SOLDERLAB_PIN_${base}`;
    if (used.has(name)) name = `SOLDERLAB_PIN_${base}_${p.pinNumber}`;
    used.add(name);
    out.push({ pin: p, macro: name });
  }
  return out;
}

export function i2cAddrMacro(d: BscBusDevice): string {
  return `SOLDERLAB_I2C_${toIdent(d.refdes, "DEV")}_ADDR`;
}

export function railMilliMacro(r: BscPowerRail): string {
  return `SOLDERLAB_RAIL_${toIdent(r.name, "RAIL")}_MV`;
}

/**
 * Emit `board.h` with #defines for pins, rails, and I2C addresses.
 * Guard macro: SOLDERLAB_BSC_VERSION (product renamed from Flux).
 */
export function emitC(bsc: BoardSupportContract): string {
  const lines: string[] = [
    cBlockComment(bsc, "c"),
    "",
    "#pragma once",
    "",
    `#ifndef SOLDERLAB_BSC_VERSION`,
    `#define SOLDERLAB_BSC_VERSION "${bsc.schemaVersion}"`,
    `#endif`,
    "",
    `/* Board: ${bsc.boardName} */`,
    "",
  ];

  lines.push("/* ---- MCU pins (pad number) ---- */");
  for (const { pin: p, macro: name } of assignPinMacros(bsc)) {
    const netNote = p.net ? ` /* ${p.net} */` : "";
    lines.push(`#define ${name} ${p.pinNumber}${netNote}`);
  }

  lines.push("", "/* ---- Power rails (millivolts when known) ---- */");
  for (const r of bsc.powerRails) {
    const name = railMilliMacro(r);
    if (r.nominalVolts == null) {
      lines.push(`/* ${name} — voltage unknown for ${r.name} */`);
    } else {
      lines.push(`#define ${name} ${Math.round(r.nominalVolts * 1000)}`);
    }
  }

  lines.push("", "/* ---- I2C addresses (only when known) ---- */");
  const i2c = bsc.busDevices.filter((d) => d.bus === "i2c");
  if (!i2c.length) {
    lines.push("/* (no I2C devices detected) */");
  }
  for (const d of i2c) {
    const name = i2cAddrMacro(d);
    if (d.address == null) {
      lines.push(`/* ${name} — address unknown for ${d.refdes} */`);
    } else {
      lines.push(`#define ${name} ${d.address}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
