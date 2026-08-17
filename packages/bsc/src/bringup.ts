import type {
  BoardSupportContract,
  BscBusDevice,
  BscMcu,
  BscPowerRail,
} from "./types.ts";

export type BringUpAction =
  | "identify_mcu"
  | "verify_ground"
  | "bring_up_rail"
  | "probe_tp"
  | "seat_connector"
  | "scan_i2c";

export interface BringUpRef {
  kind: "component" | "net" | "mcu" | "rail";
  ref: string;
}

export interface BringUpStep {
  id: string;
  action: BringUpAction;
  refs: BringUpRef[];
  instruction: string;
  millivolts: number | null;
  address: string | null;
}

export interface BringUpWithheld {
  reason: string;
  refs: BringUpRef[];
}

export interface BringUpScript {
  schemaVersion: 1;
  board: string;
  revision: string | null;
  mcu: { refdes: string; mpn: string | null } | null;
  steps: BringUpStep[];
  withheld: BringUpWithheld[];
  coverage: number;
}

function isGroundRail(r: BscPowerRail): boolean {
  return /^(GND|AGND|PGND|DGND|VSS)/i.test(r.name);
}

function millivoltsOf(r: BscPowerRail): number | null {
  if (r.nominalVolts == null) return null;
  return Math.round(r.nominalVolts * 1000);
}

function sortRails(rails: BscPowerRail[]): BscPowerRail[] {
  const indexed = rails.filter((r) => r.sequenceIndex != null);
  if (indexed.length === rails.length && rails.length > 0) {
    return [...rails].sort(
      (a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0),
    );
  }
  return [...rails].sort((a, b) => {
    const ag = isGroundRail(a) ? 0 : 1;
    const bg = isGroundRail(b) ? 0 : 1;
    if (ag !== bg) return ag - bg;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

function mcuLine(m: BscMcu): { refdes: string; mpn: string | null } {
  return { refdes: m.refdes, mpn: m.mpn };
}

/**
 * Bring-up procedure copied from a Board Support Contract.
 * Voltages and I2C addresses appear only when the contract already has them.
 */
export function generateBringUpScript(bsc: BoardSupportContract): BringUpScript {
  const steps: BringUpStep[] = [];
  const withheld: BringUpWithheld[] = [];
  const mcu = bsc.mcus[0] ? mcuLine(bsc.mcus[0]) : null;

  if (mcu) {
    const who = mcu.mpn ? `${mcu.refdes} (${mcu.mpn})` : mcu.refdes;
    steps.push({
      id: `mcu-${mcu.refdes}`,
      action: "identify_mcu",
      refs: [{ kind: "mcu", ref: mcu.refdes }],
      instruction: `Identify MCU ${who} before applying power.`,
      millivolts: null,
      address: null,
    });
  }

  for (const r of sortRails(bsc.powerRails)) {
    const refs: BringUpRef[] = [
      { kind: "rail", ref: r.name },
      { kind: "net", ref: r.name },
    ];
    if (isGroundRail(r)) {
      steps.push({
        id: `gnd-${r.name}`,
        action: "verify_ground",
        refs,
        instruction: `Verify ground ${r.name} is continuous before applying power.`,
        millivolts: null,
        address: null,
      });
      continue;
    }
    const mv = millivoltsOf(r);
    if (mv == null) {
      withheld.push({
        reason: `Rail ${r.name} has no nominal voltage in the BSC; not an apply step`,
        refs,
      });
      continue;
    }
    steps.push({
      id: `rail-${r.name}`,
      action: "bring_up_rail",
      refs,
      instruction: `Bring up rail ${r.name} (BSC nominal ${mv} mV).`,
      millivolts: mv,
      address: null,
    });
  }

  for (const c of bsc.connectors) {
    steps.push({
      id: `conn-${c.refdes}`,
      action: "seat_connector",
      refs: [{ kind: "component", ref: c.refdes }],
      instruction: `Seat connector ${c.refdes} (${c.pins.length} pins in BSC).`,
      millivolts: null,
      address: null,
    });
  }

  for (const tp of bsc.testPoints) {
    if (!tp.net) {
      withheld.push({
        reason: `Test point ${tp.refdes} has no net in the BSC`,
        refs: [{ kind: "component", ref: tp.refdes }],
      });
      continue;
    }
    steps.push({
      id: `tp-${tp.refdes}`,
      action: "probe_tp",
      refs: [
        { kind: "component", ref: tp.refdes },
        { kind: "net", ref: tp.net },
      ],
      instruction: `Probe ${tp.refdes} on net ${tp.net}.`,
      millivolts: null,
      address: null,
    });
  }

  const i2c: BscBusDevice[] = bsc.busDevices.filter((d) => d.bus === "i2c");
  for (const d of i2c) {
    const refs: BringUpRef[] = [{ kind: "component", ref: d.refdes }];
    if (!d.address) {
      withheld.push({
        reason: `I2C ${d.refdes} address unknown; refuse to guess`,
        refs,
      });
      continue;
    }
    steps.push({
      id: `i2c-${d.refdes}`,
      action: "scan_i2c",
      refs,
      instruction: `Scan I2C ${d.refdes} at ${d.address}.`,
      millivolts: null,
      address: d.address,
    });
  }

  const denom = steps.length + withheld.length;
  const coverage = denom === 0 ? 1 : steps.length / denom;

  return {
    schemaVersion: 1,
    board: bsc.boardName,
    revision: bsc.revision,
    mcu,
    steps,
    withheld,
    coverage: Math.round(coverage * 1e6) / 1e6,
  };
}
