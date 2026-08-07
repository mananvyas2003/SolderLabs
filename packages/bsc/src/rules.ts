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

/** Known MCU library nicknames / categories (prefix match on lib_id). */
export const MCU_LIB_PREFIXES = [
  "MCU_",
  "MCU_ST",
  "MCU_Microchip",
  "MCU_Espressif",
  "MCU_Nordic",
  "MCU_Cypress",
  "MCU_NXP",
  "MCU_Texas",
  "MCU_Analog",
  "MCU_Silicon",
  "Module_ESP",
  "RF_Module",
] as const;

/** Known MCU MPN / value prefixes (case-insensitive). */
export const MCU_MPN_PREFIXES = [
  "STM32",
  "ATMEGA",
  "ATTINY",
  "ATSAM",
  "SAMD",
  "NRF52",
  "NRF91",
  "ESP32",
  "ESP8266",
  "RP2040",
  "RP2350",
  "PIC16",
  "PIC18",
  "PIC24",
  "PIC32",
  "GD32",
  "CH32",
  "CY7C",
  "LM3S",
  "TMS320",
  "EFR32",
  "EFM32",
] as const;

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

function partTokens(c: SnapshotComponent): string {
  return [c.mpn, c.value, libId(c)].filter(Boolean).join(" ");
}

/** Exported for unit tests — MCU library/MPN gate (pin count checked separately). */
export function matchesMcuIdentity(c: SnapshotComponent): boolean {
  const lib = libId(c);
  if (MCU_LIB_PREFIXES.some((p) => lib.startsWith(p) || lib.includes(`:${p}`))) {
    return true;
  }
  // lib categories like "MCU_Cypress:CY7C…"
  if (/[/:]MCU[_A-Za-z]*/i.test(lib) || /^MCU_/i.test(lib)) return true;
  const tokens = partTokens(c).toUpperCase();
  return MCU_MPN_PREFIXES.some((p) => tokens.includes(p.toUpperCase()));
}

export function isMcuCandidate(c: SnapshotComponent): boolean {
  return pinCount(c) > 20 && matchesMcuIdentity(c);
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
 * Returns null (never guesses) for names like VCC/VDD without digits.
 */
export function parseNominalVolts(
  name: string,
): { volts: number | null; note?: ConfidenceNote } {
  if (/^(GND|AGND|PGND|DGND|VSS)$/i.test(name)) {
    return { volts: 0 };
  }
  // 3V3 / +3V3 / VDD_3V3
  const vStyle = name.match(/(?:^|[^0-9])(\d+)V(\d+)\b/i);
  if (vStyle) {
    return { volts: Number(`${vStyle[1]}.${vStyle[2]}`) };
  }
  // 3.3V / +3.3V
  const dotted = name.match(/(?:^|[^0-9])(\d+\.\d+)\s*V\b/i);
  if (dotted) {
    return { volts: Number(dotted[1]) };
  }
  // 5V / 12V
  const whole = name.match(/(?:^|[^0-9])(\d+)\s*V\b/i);
  if (whole) {
    return { volts: Number(whole[1]) };
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
    "MCU: pin count > 20 and library category or MPN/value prefix in known MCU list",
  match(ctx) {
    const out: BscMcu[] = [];
    for (const c of ctx.snapshot.components) {
      if (!isMcuCandidate(c)) continue;
      const notes: ConfidenceNote[] = [];
      const mpn = c.mpn || c.value || null;
      if (!c.mpn) {
        notes.push({
          field: "mpn",
          reason: c.value
            ? "Using Value field; dedicated MPN property absent"
            : "No MPN or Value on symbol",
        });
      }
      const pkg = c.footprint || null;
      if (!pkg) {
        notes.push({
          field: "package",
          reason: "Footprint empty on symbol",
        });
      }
      out.push({
        refdes: c.refdes,
        mpn: mpn || null,
        package: pkg,
        confidenceNotes: notes,
      });
    }
    return out.sort((a, b) => a.refdes.localeCompare(b.refdes, undefined, { numeric: true }));
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
    for (const net of ctx.snapshot.nets) {
      if (!isPowerRailNet(net)) continue;
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
