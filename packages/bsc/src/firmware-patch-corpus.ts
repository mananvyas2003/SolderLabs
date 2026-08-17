import type { BoardSupportContract, BscPin } from "./types.ts";
import { assignPinMacros } from "./emit/c.ts";
import { toIdent } from "./emit/common.ts";
import type { FirmwareFile } from "./firmware-patch.ts";

export interface FirmwarePatchCase {
  id: string;
  kind: "macro" | "magic" | "i2c";
  locked: BoardSupportContract;
  current: BoardSupportContract;
  files: FirmwareFile[];
}

function cloneBsc(bsc: BoardSupportContract): BoardSupportContract {
  return structuredClone(bsc);
}

function uniqueNamedPins(bsc: BoardSupportContract): BscPin[] {
  const seen = new Set<string>();
  const out: BscPin[] = [];
  for (const p of bsc.pins) {
    if (!p.pinName || p.pinName === "~") continue;
    const id = toIdent(p.pinName, "PIN");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out;
}

function reassignPin(
  bsc: BoardSupportContract,
  pin: BscPin,
  net: string,
): BoardSupportContract {
  const next = cloneBsc(bsc);
  const hit = next.pins.find(
    (p) => p.mcuRefdes === pin.mcuRefdes && p.pinNumber === pin.pinNumber,
  );
  if (!hit) {
    throw new Error(`corpus pin ${pin.mcuRefdes}.${pin.pinNumber} missing`);
  }
  hit.net = net;
  next.revision = `patch-${pin.pinNumber}`;
  next.generatedFrom = {
    ...next.generatedFrom,
    revisionId: `patch-${pin.pinNumber}`,
    sha256: "c".repeat(64),
  };
  return next;
}

function setI2cAddress(
  bsc: BoardSupportContract,
  refdes: string,
  address: string,
  revision: string,
): BoardSupportContract {
  const next = cloneBsc(bsc);
  const hit = next.busDevices.find((d) => d.bus === "i2c" && d.refdes === refdes);
  if (!hit) {
    throw new Error(`corpus I2C ${refdes} missing`);
  }
  hit.address = address;
  next.revision = revision;
  next.generatedFrom = {
    ...next.generatedFrom,
    revisionId: revision,
    sha256: "d".repeat(64),
  };
  return next;
}

function macroSource(macro: string): string {
  return `#include "board.h"\nint main(void) {\n  return ${macro};\n}\n`;
}

function magicSource(ident: string, number: string, comment: string): string {
  return `#include "board.h"\n#define APP_${ident} ${number} /* ${comment} */\nint main(void) {\n  return APP_${ident};\n}\n`;
}

function i2cSource(refdes: string, address: string): string {
  return `#include "board.h"\n#define APP_${refdes}_ADDR ${address} /* ${refdes} */\nint main(void) {\n  return APP_${refdes}_ADDR;\n}\n`;
}

/**
 * 20 firmware-patch cases from a real Glasgow BSC.
 * Pin numbers and I2C addresses in fixtures are copied from the contract,
 * never invented by the generator.
 */
export function buildFirmwarePatchCorpus(
  glasgow: BoardSupportContract,
): FirmwarePatchCase[] {
  const macros = assignPinMacros(glasgow);
  const named = uniqueNamedPins(glasgow);
  if (named.length < 18) {
    throw new Error(`glasgow corpus needs 18 unique pin names, got ${named.length}`);
  }
  const i2c = glasgow.busDevices.filter((d) => d.bus === "i2c");
  if (i2c.length < 2) {
    throw new Error("glasgow corpus needs two I2C devices");
  }

  const cases: FirmwarePatchCase[] = [];

  for (let i = 0; i < 10; i++) {
    const pin = named[i]!;
    const hit = macros.find(
      (m) => m.pin.mcuRefdes === pin.mcuRefdes && m.pin.pinNumber === pin.pinNumber,
    );
    if (!hit) throw new Error(`macro missing for ${pin.pinNumber}`);
    const current = reassignPin(glasgow, pin, `PATCH_NET_${i}`);
    cases.push({
      id: `macro-${toIdent(pin.pinName ?? pin.pinNumber, "PIN")}`,
      kind: "macro",
      locked: cloneBsc(glasgow),
      current,
      files: [{ path: "src/main.c", contents: macroSource(hit.macro) }],
    });
  }

  for (let i = 10; i < 18; i++) {
    const pin = named[i]!;
    const ident = toIdent(pin.pinName ?? pin.pinNumber, "PIN");
    const current = reassignPin(glasgow, pin, `PATCH_NET_${i}`);
    cases.push({
      id: `magic-${ident}`,
      kind: "magic",
      locked: cloneBsc(glasgow),
      current,
      files: [
        {
          path: "src/main.c",
          contents: magicSource(ident, pin.pinNumber, pin.pinName ?? ident),
        },
      ],
    });
  }

  const addrs = [
    { refdes: i2c[0]!.refdes, from: "0x50", to: "0x51" },
    { refdes: i2c[1]!.refdes, from: "0x60", to: "0x61" },
  ];
  for (const row of addrs) {
    const locked = setI2cAddress(glasgow, row.refdes, row.from, `i2c-${row.refdes}-a`);
    const current = setI2cAddress(glasgow, row.refdes, row.to, `i2c-${row.refdes}-b`);
    cases.push({
      id: `i2c-${row.refdes}`,
      kind: "i2c",
      locked,
      current,
      files: [
        {
          path: "src/main.c",
          contents: i2cSource(row.refdes, row.from),
        },
      ],
    });
  }

  if (cases.length !== 20) {
    throw new Error(`expected 20 corpus cases, got ${cases.length}`);
  }
  return cases;
}
