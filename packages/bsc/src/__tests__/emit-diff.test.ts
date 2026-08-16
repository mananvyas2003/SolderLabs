import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardSupportContract } from "../types.ts";
import { emitBSC, EMIT_FORMATS, toIdent } from "../emit/index.ts";
import { diffBSC, hasBreakingChanges } from "../diff.ts";
import { nextBscVersion } from "../semver.ts";

const sample: BoardSupportContract = {
  schemaVersion: "1.0",
  boardName: "demo-board",
  revision: "A",
  generatedFrom: {
    revisionId: "rev-1",
    sha256: "a".repeat(64),
  },
  mcus: [
    {
      refdes: "U1",
      mpn: "STM32F103C8T6",
      package: "LQFP-48",
      confidence: 0.71,
      confidenceNotes: [],
    },
  ],
  pins: [
    {
      mcuRefdes: "U1",
      pinNumber: "10",
      pinName: "PA0",
      net: "LED_DRIVE",
      function: null,
      connectedTo: [],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
    {
      mcuRefdes: "U1",
      pinNumber: "11",
      pinName: "PA1",
      net: "I2C1_SDA",
      function: null,
      connectedTo: [{ refdes: "U5", pin: "1" }],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
  ],
  revStraps: [
    {
      gpio: "U1.12",
      expectedLevel: null,
      decodesToRevision: null,
      confidenceNotes: [],
    },
  ],
  busDevices: [
    {
      bus: "i2c",
      address: "0x3C",
      chipSelect: null,
      refdes: "U5",
      mpn: "SSD1306",
      description: "OLED",
      confidenceNotes: [],
    },
  ],
  powerRails: [
    {
      name: "3V3",
      nominalVolts: 3.3,
      tolerancePct: null,
      sourceRefdes: null,
      enableNet: null,
      senseNet: null,
      sequenceIndex: null,
      confidenceNotes: [],
    },
  ],
  connectors: [
    {
      refdes: "J1",
      description: "USB",
      pins: [
        { number: "1", net: "GND", signal: "GND", confidenceNotes: [] },
        { number: "2", net: "VBUS", signal: "VBUS", confidenceNotes: [] },
      ],
      confidenceNotes: [],
    },
  ],
  testPoints: [],
  confidenceNotes: [],
};

test("every emitter includes DO NOT EDIT and source sha256 header", () => {
  for (const fmt of EMIT_FORMATS) {
    const out = emitBSC(sample, fmt);
    assert.match(out, /DO NOT EDIT/);
    assert.match(out, /source-sha256:/);
    assert.match(out, /generated-by: @solderlab\/bsc/);
    assert.match(out, new RegExp(sample.generatedFrom.sha256));
  }
});

test("emitC defines SOLDERLAB_BSC_VERSION, pins, rails, I2C", () => {
  const h = emitBSC(sample, "c");
  assert.match(h, /#define SOLDERLAB_BSC_VERSION "1\.0"/);
  assert.match(h, /#define SOLDERLAB_PIN_PA0 10/);
  assert.match(h, /#define SOLDERLAB_RAIL_N3V3_MV 3300/);
  assert.match(h, /#define SOLDERLAB_I2C_U5_ADDR 0x3C/);
});

test("emitZephyr / kconfig / rust are pure non-empty strings", () => {
  assert.match(emitBSC(sample, "zephyr"), /pinctrl|solderlab_bsc_pins/);
  assert.match(emitBSC(sample, "kconfig"), /config SOLDERLAB_BOARD_/);
  assert.match(emitBSC(sample, "rust"), /pub const SOLDERLAB_BSC_VERSION/);
  assert.match(emitBSC(sample, "json"), /"boardName": "demo-board"/);
});

test("toIdent sanitizes nets", () => {
  assert.equal(toIdent("I2C1_SDA", "NET"), "I2C1_SDA");
  assert.equal(toIdent("3V3", "RAIL"), "N3V3");
});

test("diffBSC detects pin_reassigned as breaking", () => {
  const head: BoardSupportContract = {
    ...sample,
    pins: sample.pins.map((p) =>
      p.pinNumber === "10" ? { ...p, net: "LED_ANODE" } : p,
    ),
  };
  const changes = diffBSC(sample, head);
  const hit = changes.find((c) => c.kind === "pin_reassigned");
  assert.ok(hit);
  assert.equal(hit!.severity, "breaking");
  assert.equal(hasBreakingChanges(changes), true);
  assert.equal(nextBscVersion("1.2.3", changes), "2.0.0");
});

test("diffBSC pin_added is additive → minor bump", () => {
  const head: BoardSupportContract = {
    ...sample,
    pins: [
      ...sample.pins,
      {
        mcuRefdes: "U1",
        pinNumber: "99",
        pinName: "PB0",
        net: "EXTRA",
        function: null,
        connectedTo: [],
        direction: null,
        pullState: null,
        confidenceNotes: [],
      },
    ],
  };
  const changes = diffBSC(sample, head);
  assert.ok(changes.some((c) => c.kind === "pin_added" && c.severity === "additive"));
  assert.equal(hasBreakingChanges(changes), false);
  assert.equal(nextBscVersion("1.2.3", changes), "1.3.0");
});

test("diffBSC rail voltage change is breaking major", () => {
  const head: BoardSupportContract = {
    ...sample,
    powerRails: sample.powerRails.map((r) =>
      r.name === "3V3" ? { ...r, nominalVolts: 3.0 } : r,
    ),
  };
  const changes = diffBSC(sample, head);
  assert.ok(
    changes.some(
      (c) => c.kind === "rail_voltage_changed" && c.severity === "breaking",
    ),
  );
  assert.equal(nextBscVersion("0.9.1", changes), "1.0.0");
});

test("diffBSC i2c address and connector pinout", () => {
  const head: BoardSupportContract = {
    ...sample,
    busDevices: sample.busDevices.map((d) =>
      d.refdes === "U5" ? { ...d, address: "0x3D" } : d,
    ),
    connectors: sample.connectors.map((c) =>
      c.refdes === "J1"
        ? {
            ...c,
            pins: [
              { number: "1", net: "GND", signal: "GND", confidenceNotes: [] },
              { number: "2", net: "5V", signal: "VBUS", confidenceNotes: [] },
            ],
          }
        : c,
    ),
  };
  const changes = diffBSC(sample, head);
  assert.ok(changes.some((c) => c.kind === "i2c_address_changed"));
  assert.ok(changes.some((c) => c.kind === "connector_pinout_changed"));
});

test("empty diff bumps patch", () => {
  assert.equal(nextBscVersion("1.0.0", []), "1.0.1");
});
