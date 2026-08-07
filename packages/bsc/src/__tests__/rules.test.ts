import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot, SnapshotComponent } from "@solderlab/design-core";
import {
  DETECTION_RULES,
  connectorRule,
  i2cBusRule,
  isConnectorCandidate,
  isI2cNet,
  isMcuCandidate,
  isPowerRailNet,
  isSpiNet,
  isTestPoint,
  matchesMcuIdentity,
  mcuRule,
  parseNominalVolts,
  powerRailRule,
  revStrapRule,
  spiBusRule,
  testPointRule,
} from "../rules.ts";

function snap(partial: Partial<DesignSnapshot> & {
  components: SnapshotComponent[];
}): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    nets: partial.nets ?? [],
    meta: {
      sheetCount: 1,
      componentCount: partial.components.length,
      netCount: (partial.nets ?? []).length,
    },
    ...partial,
  };
}

function pins(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    number: String(i + 1),
    name: `P${i + 1}`,
    net: "NET",
  }));
}

test("DETECTION_RULES table lists every rule id exactly once", () => {
  const ids = DETECTION_RULES.map((r) => r.id).sort();
  assert.deepEqual(ids, [
    "connector",
    "i2c_bus",
    "mcu",
    "power_rail",
    "rev_strap",
    "spi_bus",
    "test_point",
  ]);
});

test("rule:mcu — requires pin count > 20 AND known MCU identity", () => {
  const stm: SnapshotComponent = {
    refdes: "U1",
    value: "STM32F407VGT6",
    footprint: "LQFP-100",
    mpn: "STM32F407VGT6",
    libId: "MCU_ST_STM32F4:STM32F407VGTx",
    sheetId: "root",
    pins: pins(100),
  };
  const small: SnapshotComponent = {
    ...stm,
    refdes: "U2",
    pins: pins(8),
  };
  const bigUnknown: SnapshotComponent = {
    refdes: "U3",
    value: "MysteryASIC",
    footprint: "BGA-256",
    libId: "Custom:Mystery",
    sheetId: "root",
    pins: pins(100),
  };

  assert.equal(isMcuCandidate(stm), true);
  assert.equal(isMcuCandidate(small), false);
  assert.equal(matchesMcuIdentity(bigUnknown), false);
  assert.equal(isMcuCandidate(bigUnknown), false);

  const hit = mcuRule.match({ snapshot: snap({ components: [stm, small, bigUnknown] }) });
  assert.equal(hit.length, 1);
  assert.equal(hit[0]!.refdes, "U1");
  assert.equal(hit[0]!.package, "LQFP-100");
});

test("rule:mcu — Cypress CY7C matched via MPN prefix without inventing package", () => {
  const u: SnapshotComponent = {
    refdes: "U1",
    value: "CY7C68013A-56LTX",
    footprint: "",
    mpn: "CY7C68013A-56LTX",
    libId: "MCU_Cypress:CY7C68013A-56LTX",
    sheetId: "root",
    pins: pins(56),
  };
  const [mcu] = mcuRule.match({ snapshot: snap({ components: [u] }) });
  assert.ok(mcu);
  assert.equal(mcu!.package, null);
  assert.ok(mcu!.confidenceNotes.some((n) => n.field === "package"));
});

test("rule:i2c_bus — detects SDA/SCL and I2C1_SDA patterns; address stays null", () => {
  assert.equal(isI2cNet("SDA"), true);
  assert.equal(isI2cNet("I2C2_SCL"), true);
  assert.equal(isI2cNet("USB_DP"), false);

  const snapshot = snap({
    components: [
      {
        refdes: "U1",
        value: "STM32F103",
        footprint: "LQFP-48",
        libId: "MCU_ST_STM32F1:STM32F103C8Tx",
        sheetId: "root",
        pins: pins(48),
      },
      {
        refdes: "U5",
        value: "SSD1306",
        footprint: "SSD1306",
        mpn: "SSD1306",
        libId: "Display:SSD1306",
        sheetId: "root",
        pins: pins(4),
      },
      {
        refdes: "R10",
        value: "4k7",
        footprint: "R_0402",
        sheetId: "root",
        pins: pins(2),
      },
    ],
    nets: [
      { name: "I2C1_SDA", nodes: ["U1.10", "U5.1", "R10.1"] },
      { name: "I2C1_SCL", nodes: ["U1.11", "U5.2", "R10.2"] },
    ],
  });
  const devices = i2cBusRule.match({ snapshot });
  assert.equal(devices.length, 1);
  assert.equal(devices[0]!.refdes, "U5");
  assert.equal(devices[0]!.bus, "i2c");
  assert.equal(devices[0]!.address, null);
  assert.ok(devices[0]!.confidenceNotes.some((n) => n.field === "address"));
});

test("rule:spi_bus — detects SPI nets; CS left null when unbound", () => {
  assert.equal(isSpiNet("MOSI"), true);
  assert.equal(isSpiNet("SPI0_SCK"), true);
  assert.equal(isSpiNet("SDA"), false);

  const snapshot = snap({
    components: [
      {
        refdes: "U1",
        value: "STM32F103",
        footprint: "LQFP-48",
        libId: "MCU_ST_STM32F1:STM32F103C8Tx",
        sheetId: "root",
        pins: pins(48),
      },
      {
        refdes: "U8",
        value: "W25Q64",
        footprint: "SOIC-8",
        sheetId: "root",
        pins: pins(8),
      },
    ],
    nets: [
      { name: "SPI_MOSI", nodes: ["U1.20", "U8.5"] },
      { name: "SPI_MISO", nodes: ["U1.21", "U8.2"] },
      { name: "SPI_SCK", nodes: ["U1.22", "U8.6"] },
    ],
  });
  const devices = spiBusRule.match({ snapshot });
  assert.equal(devices.length, 1);
  assert.equal(devices[0]!.chipSelect, null);
  assert.ok(devices[0]!.confidenceNotes.some((n) => n.field === "chipSelect"));
});

test("rule:power_rail — class/name match; voltage parsed only when unambiguous", () => {
  assert.equal(isPowerRailNet({ name: "VCC", nodes: [] }), true);
  assert.equal(isPowerRailNet({ name: "SIG", class: "power", nodes: [] }), true);
  assert.equal(isPowerRailNet({ name: "USB_DP", nodes: [] }), false);

  assert.equal(parseNominalVolts("GND").volts, 0);
  assert.equal(parseNominalVolts("3V3").volts, 3.3);
  assert.equal(parseNominalVolts("VDD_3V3").volts, 3.3);
  assert.equal(parseNominalVolts("+5V").volts, 5);
  assert.equal(parseNominalVolts("VCC").volts, null);
  assert.ok(parseNominalVolts("VCC").note);

  const rails = powerRailRule.match({
    snapshot: snap({
      components: [],
      nets: [
        { name: "VCC", class: "power", nodes: [] },
        { name: "3V3", class: "power", nodes: [] },
        { name: "USB_DP", nodes: [] },
      ],
    }),
  });
  assert.equal(rails.length, 2);
  const vcc = rails.find((r) => r.name === "VCC")!;
  const v33 = rails.find((r) => r.name === "3V3")!;
  assert.equal(vcc.nominalVolts, null);
  assert.equal(v33.nominalVolts, 3.3);
  assert.equal(vcc.tolerancePct, null);
});

test("rule:test_point — refdes prefix TP", () => {
  assert.equal(
    isTestPoint({
      refdes: "TP12",
      value: "TestPoint",
      footprint: "",
      sheetId: "root",
    }),
    true,
  );
  assert.equal(
    isTestPoint({
      refdes: "R12",
      value: "10k",
      footprint: "",
      sheetId: "root",
    }),
    false,
  );

  const tps = testPointRule.match({
    snapshot: snap({
      components: [
        {
          refdes: "TP1",
          value: "TestPoint",
          footprint: "TestPoint",
          sheetId: "root",
          pins: [{ number: "1", name: "~", net: "3V3" }],
        },
      ],
    }),
  });
  assert.equal(tps.length, 1);
  assert.equal(tps[0]!.net, "3V3");
});

test("rule:connector — Connector lib or J/P refdes with ≥2 pins", () => {
  const j1: SnapshotComponent = {
    refdes: "J1",
    value: "USB_C",
    footprint: "USB_C",
    libId: "Connector:USB_C",
    sheetId: "root",
    pins: pins(24),
  };
  const r1: SnapshotComponent = {
    refdes: "R1",
    value: "10k",
    footprint: "R_0402",
    libId: "Device:R",
    sheetId: "root",
    pins: pins(2),
  };
  assert.equal(isConnectorCandidate(j1), true);
  assert.equal(isConnectorCandidate(r1), false);
  const cons = connectorRule.match({ snapshot: snap({ components: [j1, r1] }) });
  assert.equal(cons.length, 1);
  assert.equal(cons[0]!.refdes, "J1");
  assert.ok(cons[0]!.pins.length >= 2);
});

test("rule:rev_strap — detects REV nets but never invents level/revision", () => {
  const straps = revStrapRule.match({
    snapshot: snap({
      components: [
        {
          refdes: "U1",
          value: "STM32",
          footprint: "LQFP",
          libId: "MCU_ST_STM32F4:STM32F405",
          sheetId: "root",
          pins: pins(48),
        },
      ],
      nets: [{ name: "BOARD_REV0", nodes: ["U1.12", "R99.1"] }],
    }),
  });
  assert.equal(straps.length, 1);
  assert.equal(straps[0]!.gpio, "U1.12");
  assert.equal(straps[0]!.expectedLevel, null);
  assert.equal(straps[0]!.decodesToRevision, null);
});
