import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolsForChange } from "../symbols.ts";
import type { BSCChange } from "../diff.ts";

test("symbolsForChange includes SOLDERLAB_PIN_* for pin_reassigned", () => {
  const change: BSCChange = {
    kind: "pin_reassigned",
    severity: "breaking",
    before: {
      mcuRefdes: "U1",
      pinNumber: "16",
      pinName: "SDA",
      net: "I2C_SDA",
      function: null,
      connectedTo: [],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
    after: {
      mcuRefdes: "U1",
      pinNumber: "16",
      pinName: "SDA",
      net: "OTHER",
      function: null,
      connectedTo: [],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
    message: "test",
  };
  const syms = symbolsForChange(change);
  assert.ok(syms.includes("SOLDERLAB_PIN_SDA"));
  assert.ok(syms.includes("SOLDERLAB_PIN_I2C_SDA"));
});
