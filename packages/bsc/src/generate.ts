import { createHash } from "node:crypto";
import type { DesignSnapshot } from "@solderlab/design-core";
import {
  DETECTION_RULES,
  i2cBusRule,
  mcuRule,
  connectorRule,
  powerRailRule,
  revStrapRule,
  spiBusRule,
  testPointRule,
  type RuleContext,
} from "./rules";
import {
  BSC_SCHEMA_VERSION,
  type BoardSupportContract,
  type BscPin,
  type BscPinConnection,
  type ConfidenceNote,
} from "./types";

export interface GenerateBSCOptions {
  boardName?: string;
  revision?: string | null;
  revisionId?: string | null;
}

function stableSnapshotPayload(snapshot: DesignSnapshot): string {
  // Deterministic hash input (sort keys shallowly via JSON of sorted comps/nets)
  const payload = {
    schemaVersion: snapshot.schemaVersion,
    tool: snapshot.tool,
    sheets: snapshot.sheets,
    components: [...snapshot.components]
      .map((c) => ({
        refdes: c.refdes,
        value: c.value,
        footprint: c.footprint,
        mpn: c.mpn ?? null,
        libId: c.libId ?? null,
        uuid: c.uuid ?? null,
        sheetId: c.sheetId,
        sheetPath: c.sheetPath ?? null,
        pins: c.pins ?? [],
      }))
      .sort((a, b) => a.refdes.localeCompare(b.refdes, undefined, { numeric: true })),
    nets: [...snapshot.nets]
      .map((n) => ({
        name: n.name,
        class: n.class ?? null,
        nodes: [...n.nodes].sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return JSON.stringify(payload);
}

export function hashSnapshot(snapshot: DesignSnapshot): string {
  return createHash("sha256").update(stableSnapshotPayload(snapshot)).digest("hex");
}

function connectedToOnNet(
  snapshot: DesignSnapshot,
  netName: string,
  selfRef: string,
  selfPin: string,
): BscPinConnection[] {
  const net = snapshot.nets.find((n) => n.name === netName);
  if (!net) return [];
  const out: BscPinConnection[] = [];
  for (const node of net.nodes) {
    const i = node.lastIndexOf(".");
    if (i <= 0) continue;
    const refdes = node.slice(0, i);
    const pin = node.slice(i + 1);
    if (refdes === selfRef && pin === selfPin) continue;
    if (refdes.startsWith("#")) continue;
    out.push({ refdes, pin });
  }
  return out.sort((a, b) =>
    `${a.refdes}.${a.pin}`.localeCompare(`${b.refdes}.${b.pin}`, undefined, {
      numeric: true,
    }),
  );
}

function buildMcuPins(
  snapshot: DesignSnapshot,
  mcuRefdes: string,
): BscPin[] {
  const mcu = snapshot.components.find((c) => c.refdes === mcuRefdes);
  if (!mcu) return [];
  const pins: BscPin[] = [];

  if (mcu.pins?.length) {
    for (const p of mcu.pins) {
      const notes: ConfidenceNote[] = [];
      if (!p.net) {
        notes.push({ field: "net", reason: "Pin has no resolved net" });
      }
      notes.push({
        field: "function",
        reason: "Pin mux / alternate function not in schematic; left null",
      });
      notes.push({
        field: "direction",
        reason: "Electrical direction not reliably in snapshot; left null",
      });
      notes.push({
        field: "pullState",
        reason: "Pull-up/down not encoded on pin; left null",
      });
      pins.push({
        mcuRefdes,
        pinNumber: p.number,
        pinName: p.name && p.name !== "~" ? p.name : null,
        net: p.net || null,
        function: null,
        connectedTo: p.net
          ? connectedToOnNet(snapshot, p.net, mcuRefdes, p.number)
          : [],
        direction: null,
        pullState: null,
        confidenceNotes: notes,
      });
    }
  } else {
    // Fall back to net nodes mentioning this MCU — still don't invent pin names beyond pad#
    const prefix = `${mcuRefdes}.`;
    for (const net of snapshot.nets) {
      for (const node of net.nodes) {
        if (!node.startsWith(prefix)) continue;
        const pinNumber = node.slice(prefix.length);
        pins.push({
          mcuRefdes,
          pinNumber,
          pinName: null,
          net: net.name,
          function: null,
          connectedTo: connectedToOnNet(snapshot, net.name, mcuRefdes, pinNumber),
          direction: null,
          pullState: null,
          confidenceNotes: [
            {
              field: "pinName",
              reason: "Symbol pin list empty; only pad number from netlist",
            },
            {
              field: "function",
              reason: "Pin mux / alternate function not in schematic; left null",
            },
            {
              field: "direction",
              reason: "Electrical direction not reliably in snapshot; left null",
            },
            {
              field: "pullState",
              reason: "Pull-up/down not encoded on pin; left null",
            },
          ],
        });
      }
    }
  }

  return pins.sort((a, b) =>
    a.pinNumber.localeCompare(b.pinNumber, undefined, { numeric: true }),
  );
}

/**
 * Generate a Board Support Contract from a DesignSnapshot.
 * Detection uses the explicit rule table in `rules.ts`.
 */
export function generateBSC(
  snapshot: DesignSnapshot,
  opts: GenerateBSCOptions = {},
): BoardSupportContract {
  const ctx: RuleContext = { snapshot };
  void DETECTION_RULES; // inspectable table — individual rules invoked below

  const mcus = mcuRule.match(ctx);
  const pins = mcus.flatMap((m) => buildMcuPins(snapshot, m.refdes));
  const busDevices = [...i2cBusRule.match(ctx), ...spiBusRule.match(ctx)].sort(
    (a, b) => a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );
  const powerRails = powerRailRule.match(ctx);
  const testPoints = testPointRule.match(ctx);
  const connectors = connectorRule.match(ctx);
  const revStraps = revStrapRule.match(ctx);

  const confidenceNotes: ConfidenceNote[] = [];
  if (!mcus.length) {
    confidenceNotes.push({
      field: "mcus",
      reason:
        "No component matched MCU rule (pin count > 20 plus identity or rail/connector structure)",
    });
  }

  return {
    schemaVersion: BSC_SCHEMA_VERSION,
    boardName: opts.boardName ?? snapshot.meta.projectRoot ?? "unknown-board",
    revision: opts.revision ?? null,
    generatedFrom: {
      revisionId: opts.revisionId ?? null,
      sha256: hashSnapshot(snapshot),
    },
    mcus,
    pins,
    revStraps,
    busDevices,
    powerRails,
    connectors,
    testPoints,
    confidenceNotes,
  };
}
