import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBSC } from "../generate.ts";
import { generateBringUpScript } from "../bringup.ts";
import type { DesignSnapshot } from "@solderlab/design-core";

const mini: DesignSnapshot = {
  schemaVersion: 1,
  tool: { name: "kicad" },
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
    { name: "GND", nodes: ["U1.20", "J1.A1"], class: "ground" },
    { name: "3V3", nodes: ["TP1.1"], class: "power" },
    { name: "VBUS", nodes: ["J1.A4"], class: "power" },
  ],
  meta: { sheetCount: 1, componentCount: 4, netCount: 5 },
};

test("bring-up uses BSC volts and withholds unknown I2C addresses", () => {
  const bsc = generateBSC(mini, { boardName: "demo", revision: "A" });
  const script = generateBringUpScript(bsc);
  assert.equal(script.mcu?.refdes, "U1");
  const rail = script.steps.find((s) => s.action === "bring_up_rail" && s.refs.some((r) => r.ref === "3V3"));
  assert.ok(rail);
  assert.equal(rail!.millivolts, 3300);
  assert.match(rail!.instruction, /3300 mV/);
  assert.ok(script.steps.some((s) => s.action === "probe_tp" && s.instruction.includes("TP1")));
  assert.ok(script.steps.some((s) => s.action === "seat_connector" && s.instruction.includes("J1")));
  assert.ok(
    script.withheld.some((w) => w.reason.includes("U5") && /address unknown/i.test(w.reason)),
  );
  assert.equal(script.steps.some((s) => s.action === "scan_i2c"), false);
});

test("bring-up never invents a millivolt or I2C address", () => {
  const bsc = generateBSC(mini, { boardName: "demo" });
  const script = generateBringUpScript(bsc);
  const knownRails = new Map(bsc.powerRails.map((r) => [r.name, r.nominalVolts]));
  for (const step of script.steps) {
    if (step.millivolts != null) {
      const name = step.refs.find((r) => r.kind === "rail")?.ref;
      assert.ok(name, step.id);
      const volts = knownRails.get(name!);
      assert.ok(volts != null, `invented millivolts on ${step.id}`);
      assert.equal(step.millivolts, Math.round(volts! * 1000));
    }
    if (step.address != null) {
      const ref = step.refs.find((r) => r.kind === "component")?.ref;
      const dev = bsc.busDevices.find((d) => d.refdes === ref);
      assert.equal(step.address, dev?.address);
    }
  }
});
