import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffSnapshots,
  isPowerSymbol,
  type DesignSnapshot,
  type SnapshotComponent,
} from "../index.ts";

function snap(components: SnapshotComponent[]): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components,
    nets: [
      {
        name: "VCC",
        nodes: ["R1.1", "#PWR01.1"],
        class: "power",
      },
    ],
    meta: { sheetCount: 1, componentCount: components.length },
  };
}

test("isPowerSymbol detects #PWR and power: lib", () => {
  assert.equal(isPowerSymbol({ refdes: "#PWR0101", libId: "power:GND" }), true);
  assert.equal(isPowerSymbol({ refdes: "R1", libId: "Device:R" }), false);
});

test("diffSnapshots excludes power symbols by default", () => {
  const base = snap([
    {
      refdes: "R1",
      value: "10k",
      footprint: "0402",
      sheetId: "root",
      uuid: "u-r1",
      libId: "Device:R",
    },
    {
      refdes: "#PWR0101",
      value: "GND",
      footprint: "",
      sheetId: "root",
      uuid: "u-pwr",
      libId: "power:GND",
    },
  ]);
  const head = snap([
    {
      refdes: "R1",
      value: "4.7k",
      footprint: "0402",
      sheetId: "root",
      uuid: "u-r1",
      libId: "Device:R",
    },
    {
      refdes: "#PWR0999",
      value: "GND",
      footprint: "",
      sheetId: "root",
      uuid: "u-pwr2",
      libId: "power:GND",
    },
  ]);
  const diff = diffSnapshots(base, head, {
    baseRevisionId: "a",
    headRevisionId: "b",
  });
  assert.ok(diff.components.every((c) => !c.refdes.startsWith("#")));
  assert.equal(diff.summary.componentsChanged, 1);
  assert.equal(diff.components[0]!.refdes, "R1");

  const withPower = diffSnapshots(
    base,
    head,
    { baseRevisionId: "a", headRevisionId: "b" },
    { includePowerSymbols: true },
  );
  assert.ok(withPower.components.some((c) => c.refdes.startsWith("#")));
});
