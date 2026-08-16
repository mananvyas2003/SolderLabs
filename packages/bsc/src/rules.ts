import type { DesignSnapshot, SnapshotComponent, SnapshotNet } from "@solderlab/design-core";
import type {
  BscBusDevice,
  BscConnector,
  BscMcu,
  BscPowerRail,
  BscRevStrap,
  BscTestPoint,
  ConfidenceNote,
} from "./types";
import {
  MCU_SCORE_THRESHOLD,
  emittedMcusFromCache,
  scoreMcuCandidates,
} from "./mcu-score.ts";

export type RuleId =
  | "mcu"
  | "i2c_bus"
  | "spi_bus"
  | "power_rail"
  | "test_point"
  | "connector"
  | "rev_strap";

export interface RuleContext {
  snapshot: DesignSnapshot;
}

export {
  MCU_LIB_PREFIXES,
  MCU_MPN_PREFIXES,
  matchesMcuIdentity,
} from "./mcu-identity.ts";

export const I2C_NET_RE = /^(SDA|SCL)$|^I2C\d*_(SDA|SCL)$/i;
export const SPI_NET_RE =
  /^(MOSI|MISO|SCK|SCLK|SS|CS)$|^SPI\d*_(MOSI|MISO|SCK|SCLK|CS|SS)$/i;
export const POWER_RAIL_RE = /^(VCC|VDD|VSS|GND|V?\d+V\d*|VBAT|VBUS|\+\d)/i;
export const TEST_POINT_RE = /^TP/i;
export const CONNECTOR_LIB_RE = /^(Connector|Conn_|Connector_Generic)/i;
export const CONNECTOR_REF_RE = /^J\d|^P\d|^X\d|^CON/i;
export const REV_STRAP_NET_RE =
  /^(REV(ISION)?_?(STRAP|SEL|ID|GPIO)|BOARD_REV|HW_REV)/i;

export interface DetectionRule<T> {
  id: RuleId;
  description: string;
  match: (ctx: RuleContext) => T[];
}

function pinCount(c: SnapshotComponent): number {
  return c.pins?.length ?? 0;
}

function libId(c: SnapshotComponent): string {
  return c.libId ?? "";
}

function netsTouching(
  c: SnapshotComponent,
  snapshot: DesignSnapshot,
): SnapshotNet[] {
  const prefix = `${c.refdes}.`;
  return snapshot.nets.filter((n) => n.nodes.some((node) => node.startsWith(prefix)));
}

/** Rail fan-in and connector fan-out used when the MCU allowlist misses. */
export function mcuStructuralSignals(
  c: SnapshotComponent,
  snapshot: DesignSnapshot,
): { railFanIn: number; connectorFanOut: number } {
  const connectorRefs = new Set(
    snapshot.components.filter((x) => isConnectorCandidate(x)).map((x) => x.refdes),
  );
  const mine = netsTouching(c, snapshot);
  const railFanIn = mine.filter((n) => isPowerRailNet(n)).length;
  const connectorFanOut = mine.filter((n) =>
    n.nodes.some((node) => {
      const i = node.lastIndexOf(".");
      return i > 0 && connectorRefs.has(node.slice(0, i));
    }),
  ).length;
  return { railFanIn, connectorFanOut };
}

export function isMcuCandidate(
  c: SnapshotComponent,
  snapshot?: DesignSnapshot,
): boolean {
  const view: DesignSnapshot = snapshot ?? {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [c],
    nets: [],
    meta: { sheetCount: 1, componentCount: 1, netCount: 0 },
  };
  const hit = scoreMcuCandidates(view).find(
    (s) => s.refdes === c.refdes && (c.boardKey == null || s.boardKey === c.boardKey),
  );
  return (hit?.score ?? 0) >= MCU_SCORE_THRESHOLD;
}

export function isI2cNet(name: string): boolean {
  return I2C_NET_RE.test(name);
}

export function isSpiNet(name: string): boolean {
  return SPI_NET_RE.test(name);
}

export function isPowerRailNet(net: SnapshotNet): boolean {
  if (net.class === "power" || net.class === "ground") return true;
  return POWER_RAIL_RE.test(net.name);
}

export function isTestPoint(c: SnapshotComponent): boolean {
  return TEST_POINT_RE.test(c.refdes);
}

export function isConnectorCandidate(c: SnapshotComponent): boolean {
  if (CONNECTOR_LIB_RE.test(libId(c))) return true;
  if (CONNECTOR_REF_RE.test(c.refdes) && pinCount(c) >= 2) return true;
  return false;
}

/**
 * Parse an explicit voltage from a net name when unambiguous.
 * Sign and comma decimals are kept; ranges (3,3-5V) and bare VCC/VDD return null.
 */
export function parseNominalVolts(
  name: string,
): { volts: number | null; note?: ConfidenceNote } {
  if (/^(GND|AGND|PGND|DGND|VSS)$/i.test(name)) {
    return { volts: 0 };
  }
  // Two numeric voltages joined by a hyphen — a range, not a signed rail.
  if (/(?:^|[^0-9])\d+(?:[.,]\d+)?\s*V?\s*-\s*\d/i.test(name)) {
    return {
      volts: null,
      note: {
        field: "nominalVolts",
        reason: `Net name "${name}" encodes a voltage range; left null`,
      },
    };
  }
  const afterV = String.raw`V(?![A-Za-z])`;
  const signedDecimal = name.match(
    new RegExp(String.raw`(?:^|[^0-9])([+-])?(\d+)[.,](\d+)\s*${afterV}`, "i"),
  );
  if (signedDecimal) {
    const mag = Number(`${signedDecimal[2]}.${signedDecimal[3]}`);
    return { volts: signedDecimal[1] === "-" ? -mag : mag };
  }
  const vStyle = name.match(/(?:^|[^0-9])([+-])?(\d+)V(\d+)(?![A-Za-z])/i);
  if (vStyle) {
    const mag = Number(`${vStyle[2]}.${vStyle[3]}`);
    return { volts: vStyle[1] === "-" ? -mag : mag };
  }
  const whole = name.match(
    new RegExp(String.raw`(?:^|[^0-9])([+-])?(\d+)\s*${afterV}`, "i"),
  );
  if (whole) {
    const mag = Number(whole[2]);
    return { volts: whole[1] === "-" ? -mag : mag };
  }
  return {
    volts: null,
    note: {
      field: "nominalVolts",
      reason: `Net name "${name}" does not encode an unambiguous voltage`,
    },
  };
}

function nodesOnNet(net: SnapshotNet): Array<{ refdes: string; pin: string }> {
  const out: Array<{ refdes: string; pin: string }> = [];
  for (const n of net.nodes) {
    const i = n.lastIndexOf(".");
    if (i <= 0) continue;
    out.push({ refdes: n.slice(0, i), pin: n.slice(i + 1) });
  }
  return out;
}

function primaryNetForComponent(
  c: SnapshotComponent,
  snapshot: DesignSnapshot,
): string | null {
  if (c.pins?.length) {
    const named = c.pins.find((p) => p.net && !/^N\$|^Net-\(/i.test(p.net));
    if (named?.net) return named.net;
    if (c.pins[0]?.net) return c.pins[0].net;
  }
  const prefix = `${c.refdes}.`;
  for (const net of snapshot.nets) {
    if (net.nodes.some((n) => n.startsWith(prefix))) return net.name;
  }
  return null;
}

export const mcuRule: DetectionRule<BscMcu> = {
  id: "mcu",
  description:
    "MCU: scored heuristics (pins, debug/xtal hops, power fan-in, decoupling, family identity); emit above threshold",
  match(ctx) {
    return emittedMcusFromCache(ctx.snapshot);
  },
};

export const i2cBusRule: DetectionRule<BscBusDevice> = {
  id: "i2c_bus",
  description: "I2C: nets named SDA/SCL or I2C*_SDA/SCL; devices on those nets",
  match(ctx) {
    const i2cNets = ctx.snapshot.nets.filter((n) => isI2cNet(n.name));
    if (!i2cNets.length) return [];

    const mcuRefs = new Set(mcuRule.match(ctx).map((m) => m.refdes));
    const deviceRefs = new Set<string>();
    for (const net of i2cNets) {
      for (const node of nodesOnNet(net)) {
        if (mcuRefs.has(node.refdes)) continue;
        if (node.refdes.startsWith("#")) continue;
        deviceRefs.add(node.refdes);
      }
    }

    const out: BscBusDevice[] = [];
    for (const refdes of [...deviceRefs].sort()) {
      const c = ctx.snapshot.components.find((x) => x.refdes === refdes);
      if (!c) continue;
      // Skip generic passives on the bus
      if (/^R\d|^C\d|^L\d|^FB\d|^TP/i.test(refdes)) continue;
      out.push({
        bus: "i2c",
        address: null,
        chipSelect: null,
        refdes,
        mpn: c.mpn || c.value || null,
        description: c.value || c.libId || null,
        confidenceNotes: [
          {
            field: "address",
            reason:
              "I2C address is not encoded in the schematic snapshot; refuse to guess",
          },
        ],
      });
    }
    return out;
  },
};

export const spiBusRule: DetectionRule<BscBusDevice> = {
  id: "spi_bus",
  description: "SPI: nets matching MOSI/MISO/SCK/CS patterns; devices on those nets",
  match(ctx) {
    const spiNets = ctx.snapshot.nets.filter((n) => isSpiNet(n.name));
    if (!spiNets.length) return [];
    const mcuRefs = new Set(mcuRule.match(ctx).map((m) => m.refdes));
    const deviceRefs = new Set<string>();
    for (const net of spiNets) {
      for (const node of nodesOnNet(net)) {
        if (mcuRefs.has(node.refdes)) continue;
        if (node.refdes.startsWith("#")) continue;
        deviceRefs.add(node.refdes);
      }
    }
    const csNets = spiNets.filter((n) => /CS|SS/i.test(n.name));
    const out: BscBusDevice[] = [];
    for (const refdes of [...deviceRefs].sort()) {
      const c = ctx.snapshot.components.find((x) => x.refdes === refdes);
      if (!c) continue;
      if (/^R\d|^C\d|^L\d|^FB\d|^TP/i.test(refdes)) continue;
      const onCs = csNets.find((n) =>
        n.nodes.some((node) => node.startsWith(`${refdes}.`)),
      );
      const notes: ConfidenceNote[] = [];
      if (!onCs) {
        notes.push({
          field: "chipSelect",
          reason: "Could not bind a CS/SS net to this device",
        });
      }
      out.push({
        bus: "spi",
        address: null,
        chipSelect: onCs?.name ?? null,
        refdes,
        mpn: c.mpn || c.value || null,
        description: c.value || c.libId || null,
        confidenceNotes: notes,
      });
    }
    return out;
  },
};

export const powerRailRule: DetectionRule<BscPowerRail> = {
  id: "power_rail",
  description:
    'Power rail: net matching /^(VCC|VDD|V?\\d+V\\d+|GND|VSS)/i or class "power"/"ground"',
  match(ctx) {
    const out: BscPowerRail[] = [];
    const seen = new Set<string>();
    for (const net of ctx.snapshot.nets) {
      if (!net.nodes.length) continue;
      if (!isPowerRailNet(net)) continue;
      const key = `${net.boardKey ?? ""}\0${net.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { volts, note } = parseNominalVolts(net.name);
      const notes: ConfidenceNote[] = [];
      if (note) notes.push(note);
      notes.push({
        field: "tolerancePct",
        reason: "Tolerance not present in schematic; left null",
      });
      notes.push({
        field: "sourceRefdes",
        reason: "Regulator source inference not implemented; left null",
      });
      notes.push({
        field: "enableNet",
        reason: "Enable net not inferred; left null",
      });
      notes.push({
        field: "senseNet",
        reason: "Sense net not inferred; left null",
      });
      notes.push({
        field: "sequenceIndex",
        reason: "Power sequence not encoded; left null",
      });
      out.push({
        name: net.name,
        nominalVolts: volts,
        tolerancePct: null,
        sourceRefdes: null,
        enableNet: null,
        senseNet: null,
        sequenceIndex: null,
        confidenceNotes: notes,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
};

export const testPointRule: DetectionRule<BscTestPoint> = {
  id: "test_point",
  description: "Test point: refdes prefix TP",
  match(ctx) {
    const out: BscTestPoint[] = [];
    for (const c of ctx.snapshot.components) {
      if (!isTestPoint(c)) continue;
      const net = primaryNetForComponent(c, ctx.snapshot);
      const notes: ConfidenceNote[] = [];
      if (!net) {
        notes.push({
          field: "net",
          reason: "No net attached to test point pins in snapshot",
        });
      }
      out.push({
        refdes: c.refdes,
        net,
        description: c.value || null,
        confidenceNotes: notes,
      });
    }
    return out.sort((a, b) =>
      a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
    );
  },
};

export const connectorRule: DetectionRule<BscConnector> = {
  id: "connector",
  description:
    "Connector: Connector:* lib_id or J/P/X/CON refdes with ≥2 pins",
  match(ctx) {
    const out: BscConnector[] = [];
    for (const c of ctx.snapshot.components) {
      if (!isConnectorCandidate(c)) continue;
      const pins = (c.pins ?? []).map((p) => ({
        number: p.number,
        net: p.net || null,
        signal: p.name && p.name !== "~" ? p.name : null,
        confidenceNotes: !p.net
          ? [
              {
                field: "net",
                reason: "Pin has no resolved net",
              },
            ]
          : ([] as ConfidenceNote[]),
      }));
      out.push({
        refdes: c.refdes,
        description: c.value || c.libId || null,
        pins: pins.sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true }),
        ),
        confidenceNotes: !pins.length
          ? [
              {
                field: "pins",
                reason: "No pins resolved for connector",
              },
            ]
          : [],
      });
    }
    return out.sort((a, b) =>
      a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
    );
  },
};

export const revStrapRule: DetectionRule<BscRevStrap> = {
  id: "rev_strap",
  description:
    "Rev strap: nets matching REV*/BOARD_REV patterns — levels/decoding never guessed",
  match(ctx) {
    const strapNets = ctx.snapshot.nets.filter((n) =>
      REV_STRAP_NET_RE.test(n.name),
    );
    if (!strapNets.length) return [];
    const out: BscRevStrap[] = [];
    for (const net of strapNets) {
      const gpioNode = nodesOnNet(net).find((n) =>
        /^U\d/i.test(n.refdes),
      );
      out.push({
        gpio: gpioNode ? `${gpioNode.refdes}.${gpioNode.pin}` : null,
        expectedLevel: null,
        decodesToRevision: null,
        confidenceNotes: [
          {
            field: "expectedLevel",
            reason:
              "Schematic does not encode expected strap level; refuse to guess",
          },
          {
            field: "decodesToRevision",
            reason:
              "Revision decode table not present in schematic; refuse to guess",
          },
          ...(!gpioNode
            ? [
                {
                  field: "gpio",
                  reason: "No U* MCU pin found on strap net",
                } satisfies ConfidenceNote,
              ]
            : []),
        ],
      });
    }
    return out;
  },
};

/** Explicit, inspectable rule table — detection entry points for generateBSC. */
export const DETECTION_RULES = [
  mcuRule,
  i2cBusRule,
  spiBusRule,
  powerRailRule,
  testPointRule,
  connectorRule,
  revStrapRule,
] as const;
