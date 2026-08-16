import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignSnapshot } from "@solderlab/design-core";
import { generateBSC, hashSnapshot } from "../generate.ts";
import { BSC_SCHEMA_VERSION } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(
  here,
  "../../schema/board-support-contract.schema.json",
);

const mini: DesignSnapshot = {
  schemaVersion: 1,
  tool: { name: "kicad", version: "8.0" },
  sheets: [{ id: "root", name: "Root" }],
  components: [
    {
      refdes: "U1",
      value: "STM32F103C8T6",
      footprint: "LQFP-48",
      mpn: "STM32F103C8T6",
      libId: "MCU_ST_STM32F1:STM32F103C8Tx",
      sheetId: "root",
      pins: [
        { number: "10", name: "PA0", net: "I2C1_SDA" },
        { number: "11", name: "PA1", net: "I2C1_SCL" },
        { number: "12", name: "PA2", net: "BOARD_REV0" },
        ...Array.from({ length: 30 }, (_, i) => ({
          number: String(20 + i),
          name: `P${20 + i}`,
          net: "GND",
        })),
      ],
    },
    {
      refdes: "U5",
      value: "SSD1306",
      footprint: "SSD1306",
      libId: "Display:SSD1306",
      sheetId: "root",
      pins: [
        { number: "1", name: "SDA", net: "I2C1_SDA" },
        { number: "2", name: "SCL", net: "I2C1_SCL" },
      ],
    },
    {
      refdes: "TP1",
      value: "TestPoint",
      footprint: "TestPoint",
      sheetId: "root",
      pins: [{ number: "1", name: "~", net: "3V3" }],
    },
    {
      refdes: "J1",
      value: "USB_C",
      footprint: "USB_C",
      libId: "Connector:USB_C",
      sheetId: "root",
      pins: [
        { number: "A1", name: "GND", net: "GND" },
        { number: "A4", name: "VBUS", net: "VBUS" },
      ],
    },
  ],
  nets: [
    { name: "I2C1_SDA", nodes: ["U1.10", "U5.1"], class: "signal" },
    { name: "I2C1_SCL", nodes: ["U1.11", "U5.2"], class: "signal" },
    { name: "BOARD_REV0", nodes: ["U1.12"], class: "signal" },
    { name: "GND", nodes: ["U1.20", "J1.A1"], class: "ground" },
    { name: "3V3", nodes: ["TP1.1"], class: "power" },
    { name: "VBUS", nodes: ["J1.A4"], class: "power" },
  ],
  meta: { sheetCount: 1, componentCount: 4, netCount: 6, projectRoot: "demo" },
};

test("generateBSC produces schemaVersion 1.0 with stable sha256", () => {
  const a = generateBSC(mini, {
    boardName: "demo",
    revision: "A",
    revisionId: "rev-1",
  });
  const b = generateBSC(mini, {
    boardName: "demo",
    revision: "A",
    revisionId: "rev-1",
  });
  assert.equal(a.schemaVersion, BSC_SCHEMA_VERSION);
  assert.equal(a.generatedFrom.sha256, hashSnapshot(mini));
  assert.equal(a.generatedFrom.sha256, b.generatedFrom.sha256);
  assert.equal(a.mcus.length, 1);
  assert.equal(typeof a.mcus[0]!.confidence, "number");
  assert.ok(a.mcus[0]!.confidence > 0 && a.mcus[0]!.confidence <= 1);
  assert.ok(a.pins.length >= 30);
  assert.ok(a.busDevices.some((d) => d.bus === "i2c" && d.refdes === "U5"));
  assert.ok(a.powerRails.some((r) => r.name === "3V3" && r.nominalVolts === 3.3));
  assert.ok(a.testPoints.some((t) => t.refdes === "TP1"));
  assert.ok(a.connectors.some((c) => c.refdes === "J1"));
  assert.ok(a.revStraps.length >= 1);
  assert.equal(a.revStraps[0]!.expectedLevel, null);
});

test("JSON Schema file exists and declares BoardSupportContract", () => {
  assert.ok(fs.existsSync(schemaPath));
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.title, "BoardSupportContract");
  assert.equal(schema.properties.schemaVersion.const, "1.0");
});

test("I2C address and pin function are null with confidence notes (no guessing)", () => {
  const bsc = generateBSC(mini, { boardName: "demo" });
  const i2c = bsc.busDevices.find((d) => d.bus === "i2c")!;
  assert.equal(i2c.address, null);
  const pin = bsc.pins.find((p) => p.pinNumber === "10")!;
  assert.equal(pin.function, null);
  assert.ok(pin.confidenceNotes.some((n) => n.field === "function"));
});
