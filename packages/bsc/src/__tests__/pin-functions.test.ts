import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardSupportContract } from "../types.ts";
import { lookupPinFunctions, pinsWithLookedUpFunctions } from "../pin-functions.ts";

const bsc: BoardSupportContract = {
  schemaVersion: "1.0",
  boardName: "demo",
  revision: "A",
  generatedFrom: { revisionId: "r1", sha256: "a".repeat(64) },
  mcus: [
    {
      refdes: "U1",
      mpn: "STM32F103C8T6",
      package: "LQFP-48",
      confidence: 0.9,
      confidenceNotes: [],
    },
  ],
  pins: [
    {
      mcuRefdes: "U1",
      pinNumber: "10",
      pinName: "PA0",
      net: "I2C1_SDA",
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
      net: "I2C1_SCL",
      function: null,
      connectedTo: [],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
  ],
  revStraps: [],
  busDevices: [],
  powerRails: [],
  connectors: [],
  testPoints: [],
  confidenceNotes: [],
};

test("B5 without a table is unverifiable and does not invent functions", () => {
  const out = lookupPinFunctions(bsc, null);
  assert.equal(out.status, "unverifiable");
  assert.equal(out.matched.length, 0);
  const pins = pinsWithLookedUpFunctions(bsc.pins, out);
  assert.equal(pins[0]!.function, null);
  assert.equal(pins[0]!.pinName, "PA0");
  assert.notEqual(pins[0]!.function, pins[0]!.pinName);
});

test("B5 copies functions only for exact MPN + pin number hits", () => {
  const out = lookupPinFunctions(bsc, [
    { mpn: "STM32F103C8T6", pinNumber: "10", function: "I2C1_SDA" },
  ]);
  assert.equal(out.status, "verified");
  assert.equal(out.matched.length, 1);
  assert.equal(out.matched[0]!.function, "I2C1_SDA");
  assert.equal(out.unmatched.some((p) => p.pinNumber === "11"), true);
  const pins = pinsWithLookedUpFunctions(bsc.pins, out);
  assert.equal(pins.find((p) => p.pinNumber === "10")?.function, "I2C1_SDA");
  assert.equal(pins.find((p) => p.pinNumber === "11")?.function, null);
});
