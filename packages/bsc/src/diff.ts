import type {
  BoardSupportContract,
  BscBusDevice,
  BscConnector,
  BscPin,
  BscPowerRail,
  BscRevStrap,
} from "./types";

export type BSCChangeKind =
  | "pin_reassigned"
  | "pin_removed"
  | "pin_added"
  | "rail_voltage_changed"
  | "rail_added"
  | "rail_removed"
  | "i2c_address_changed"
  | "connector_pinout_changed"
  | "rev_strap_changed";

export type BSCChangeSeverity = "breaking" | "compatible" | "additive";

export interface BSCChange {
  kind: BSCChangeKind;
  severity: BSCChangeSeverity;
  before: unknown;
  after: unknown;
  message: string;
}

/** @deprecated alias — prompt called the array BSCBreakingChange[]; includes non-breaking too */
export type BSCBreakingChange = BSCChange;

function pinKey(p: BscPin): string {
  return `${p.mcuRefdes}:${p.pinNumber}`;
}

function railKey(r: BscPowerRail): string {
  return r.name;
}

function i2cKey(d: BscBusDevice): string {
  return d.refdes;
}

function connectorKey(c: BscConnector): string {
  return c.refdes;
}

function strapKey(s: BscRevStrap, i: number): string {
  return s.gpio ?? `strap#${i}`;
}

function connectorFingerprint(c: BscConnector): string {
  return c.pins
    .map((p) => `${p.number}=${p.net ?? ""}`)
    .sort()
    .join("|");
}

/**
 * Diff two Board Support Contracts.
 * Severity:
 *  - breaking: firmware likely breaks (pin/net, voltage, I2C addr, connector, strap)
 *  - additive: new surface only
 *  - compatible: informational / removals of unused rails etc. that don't rename pins
 */
export function diffBSC(
  a: BoardSupportContract,
  b: BoardSupportContract,
): BSCChange[] {
  const changes: BSCChange[] = [];

  // ---- Pins ----
  const aPins = new Map(a.pins.map((p) => [pinKey(p), p]));
  const bPins = new Map(b.pins.map((p) => [pinKey(p), p]));
  for (const [k, before] of aPins) {
    const after = bPins.get(k);
    if (!after) {
      changes.push({
        kind: "pin_removed",
        severity: "breaking",
        before,
        after: null,
        message: `Pin ${k} removed (was net ${before.net ?? "null"})`,
      });
      continue;
    }
    if ((before.net ?? null) !== (after.net ?? null)) {
      changes.push({
        kind: "pin_reassigned",
        severity: "breaking",
        before,
        after,
        message: `Pin ${k} reassigned: ${before.net ?? "null"} → ${after.net ?? "null"}`,
      });
    }
  }
  for (const [k, after] of bPins) {
    if (aPins.has(k)) continue;
    changes.push({
      kind: "pin_added",
      severity: "additive",
      before: null,
      after,
      message: `Pin ${k} added (net ${after.net ?? "null"})`,
    });
  }

  // ---- Rails ----
  const aRails = new Map(a.powerRails.map((r) => [railKey(r), r]));
  const bRails = new Map(b.powerRails.map((r) => [railKey(r), r]));
  for (const [k, before] of aRails) {
    const after = bRails.get(k);
    if (!after) {
      changes.push({
        kind: "rail_removed",
        severity: "compatible",
        before,
        after: null,
        message: `Power rail ${k} removed`,
      });
      continue;
    }
    if (before.nominalVolts !== after.nominalVolts) {
      // null→value is additive insight; value change or value→null is breaking
      const was = before.nominalVolts;
      const now = after.nominalVolts;
      const severity: BSCChangeSeverity =
        was != null && now != null && was !== now
          ? "breaking"
          : was != null && now == null
            ? "breaking"
            : "compatible";
      changes.push({
        kind: "rail_voltage_changed",
        severity,
        before,
        after,
        message: `Rail ${k} voltage: ${was ?? "null"} → ${now ?? "null"} V`,
      });
    }
  }
  for (const [k, after] of bRails) {
    if (aRails.has(k)) continue;
    changes.push({
      kind: "rail_added",
      severity: "additive",
      before: null,
      after,
      message: `Power rail ${k} added`,
    });
  }

  // ---- I2C addresses ----
  const aI2c = new Map(
    a.busDevices.filter((d) => d.bus === "i2c").map((d) => [i2cKey(d), d]),
  );
  const bI2c = new Map(
    b.busDevices.filter((d) => d.bus === "i2c").map((d) => [i2cKey(d), d]),
  );
  for (const [k, before] of aI2c) {
    const after = bI2c.get(k);
    if (!after) continue;
    if ((before.address ?? null) !== (after.address ?? null)) {
      const severity: BSCChangeSeverity =
        before.address != null &&
        after.address != null &&
        before.address !== after.address
          ? "breaking"
          : before.address != null && after.address == null
            ? "breaking"
            : "compatible";
      changes.push({
        kind: "i2c_address_changed",
        severity,
        before,
        after,
        message: `I2C ${k} address: ${before.address ?? "null"} → ${after.address ?? "null"}`,
      });
    }
  }

  // ---- Connectors ----
  const aConn = new Map(a.connectors.map((c) => [connectorKey(c), c]));
  const bConn = new Map(b.connectors.map((c) => [connectorKey(c), c]));
  for (const [k, before] of aConn) {
    const after = bConn.get(k);
    if (!after) {
      changes.push({
        kind: "connector_pinout_changed",
        severity: "breaking",
        before,
        after: null,
        message: `Connector ${k} removed`,
      });
      continue;
    }
    if (connectorFingerprint(before) !== connectorFingerprint(after)) {
      changes.push({
        kind: "connector_pinout_changed",
        severity: "breaking",
        before,
        after,
        message: `Connector ${k} pinout changed`,
      });
    }
  }

  // ---- Rev straps ----
  const aStraps = new Map(a.revStraps.map((s, i) => [strapKey(s, i), s]));
  const bStraps = new Map(b.revStraps.map((s, i) => [strapKey(s, i), s]));
  const strapKeys = new Set([...aStraps.keys(), ...bStraps.keys()]);
  for (const k of strapKeys) {
    const before = aStraps.get(k) ?? null;
    const after = bStraps.get(k) ?? null;
    if (!before && after) {
      changes.push({
        kind: "rev_strap_changed",
        severity: "additive",
        before: null,
        after,
        message: `Rev strap ${k} added`,
      });
      continue;
    }
    if (before && !after) {
      changes.push({
        kind: "rev_strap_changed",
        severity: "breaking",
        before,
        after: null,
        message: `Rev strap ${k} removed`,
      });
      continue;
    }
    if (
      before &&
      after &&
      (before.expectedLevel !== after.expectedLevel ||
        before.decodesToRevision !== after.decodesToRevision ||
        before.gpio !== after.gpio)
    ) {
      changes.push({
        kind: "rev_strap_changed",
        severity: "breaking",
        before,
        after,
        message: `Rev strap ${k} definition changed`,
      });
    }
  }

  return changes;
}

export function hasBreakingChanges(changes: BSCChange[]): boolean {
  return changes.some((c) => c.severity === "breaking");
}
