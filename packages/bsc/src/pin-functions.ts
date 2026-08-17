import type { BoardSupportContract, BscPin } from "./types.ts";

export interface PinFunctionRecord {
  mpn: string;
  pinNumber: string;
  function: string;
}

export interface PinFunctionHit {
  mcuRefdes: string;
  mpn: string | null;
  pinNumber: string;
  pinName: string | null;
  function: string;
  net: string | null;
}

export interface PinFunctionLookup {
  status: "verified" | "unverifiable";
  matched: PinFunctionHit[];
  unmatched: Array<{ mcuRefdes: string; pinNumber: string; pinName: string | null }>;
  reason: string | null;
}

function keyOf(mpn: string, pin: string): string {
  return `${mpn.trim().toUpperCase()}\0${pin.trim()}`;
}

/**
 * B5 — fill pin functions only from an explicit datasheet table.
 * Schematic pinName is not a datasheet function. No table → unverifiable.
 */
export function lookupPinFunctions(
  bsc: BoardSupportContract,
  table: PinFunctionRecord[] | null | undefined,
): PinFunctionLookup {
  if (!table?.length) {
    return {
      status: "unverifiable",
      matched: [],
      unmatched: bsc.pins.map((p) => ({
        mcuRefdes: p.mcuRefdes,
        pinNumber: p.pinNumber,
        pinName: p.pinName,
      })),
      reason: "datasheet pin-function table not configured",
    };
  }
  const mpnByRef = new Map(
    bsc.mcus.map((m) => [m.refdes, m.mpn]),
  );
  const index = new Map<string, PinFunctionRecord>();
  for (const row of table) {
    if (!row.mpn || !row.pinNumber || !row.function) continue;
    index.set(keyOf(row.mpn, row.pinNumber), row);
  }
  const matched: PinFunctionHit[] = [];
  const unmatched: PinFunctionLookup["unmatched"] = [];
  for (const p of bsc.pins) {
    const mpn = mpnByRef.get(p.mcuRefdes) ?? null;
    const hit = mpn ? index.get(keyOf(mpn, p.pinNumber)) : undefined;
    if (!hit) {
      unmatched.push({
        mcuRefdes: p.mcuRefdes,
        pinNumber: p.pinNumber,
        pinName: p.pinName,
      });
      continue;
    }
    matched.push({
      mcuRefdes: p.mcuRefdes,
      mpn,
      pinNumber: p.pinNumber,
      pinName: p.pinName,
      function: hit.function,
      net: p.net,
    });
  }
  return {
    status: matched.length ? "verified" : "unverifiable",
    matched,
    unmatched,
    reason: matched.length
      ? null
      : "no table row matched an MCU MPN + pin number",
  };
}

/** Apply table hits onto a copy of the pin list. Unmatched functions stay null. */
export function pinsWithLookedUpFunctions(
  pins: BscPin[],
  lookup: PinFunctionLookup,
): BscPin[] {
  const byKey = new Map(
    lookup.matched.map((h) => [`${h.mcuRefdes}:${h.pinNumber}`, h.function]),
  );
  return pins.map((p) => {
    const fn = byKey.get(`${p.mcuRefdes}:${p.pinNumber}`);
    if (!fn) return p;
    return { ...p, function: fn };
  });
}
