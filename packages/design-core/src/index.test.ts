import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffSnapshots,
  localCopilotFindings,
  semanticDiff,
  type DesignSnapshot,
} from "./index.ts";

const base: DesignSnapshot = {
  schemaVersion: 1,
  tool: { name: "kicad", version: "8.0" },
  sheets: [{ id: "root", name: "Root" }],
  components: [
    {
      refdes: "C12",
      value: "100nF",
      footprint: "C_0402",
      mpn: "CL05B104KO5NNNC",
      sheetId: "root",
      x: 10,
      y: 20,
      pins: [
        { number: "1", name: "~", net: "VDD" },
        { number: "2", name: "~", net: "GND" },
      ],
    },
    {
      refdes: "U1",
      value: "AP2112K",
      footprint: "SOT-23-5",
      mpn: "AP2112K-3.3TRG1",
      sheetId: "root",
      x: 40,
      y: 20,
      pins: [
        { number: "1", name: "VIN", net: "VIN" },
        { number: "2", name: "GND", net: "GND" },
        { number: "5", name: "VOUT", net: "VDD" },
      ],
    },
  ],
  nets: [
    { name: "VDD", class: "power", nodes: ["U1.5", "C12.1"], isNamed: true },
    { name: "GND", class: "ground", nodes: ["U1.2", "C12.2"], isNamed: true },
    { name: "VIN", class: "power", nodes: ["U1.1"], isNamed: true },
  ],
  meta: { sheetCount: 1, componentCount: 2, netCount: 3 },
};

const head: DesignSnapshot = {
  ...base,
  components: [
    {
      refdes: "C12",
      value: "1uF",
      footprint: "C_0402",
      mpn: "CL05A105KA5NQNC",
      sheetId: "root",
      x: 10,
      y: 20,
      pins: [
        { number: "1", name: "~", net: "VDD" },
        { number: "2", name: "~", net: "GND" },
      ],
    },
    {
      refdes: "U1",
      value: "AP2112K",
      footprint: "SOT-23-5",
      mpn: "AP2112K-3.3TRG1",
      sheetId: "root",
      x: 40,
      y: 20,
      pins: [
        { number: "1", name: "VIN", net: "VIN" },
        { number: "2", name: "GND", net: "GND" },
        { number: "5", name: "VOUT", net: "VDD" },
      ],
    },
    {
      refdes: "R1",
      value: "10k",
      footprint: "R_0402",
      sheetId: "root",
      x: 60,
      y: 20,
      pins: [
        { number: "1", name: "~", net: "VDD" },
        { number: "2", name: "~", net: "LED_ANODE" },
      ],
    },
  ],
  nets: [
    {
      name: "VDD",
      class: "power",
      nodes: ["U1.5", "C12.1", "R1.1"],
      isNamed: true,
    },
    { name: "GND", class: "ground", nodes: ["U1.2", "C12.2"], isNamed: true },
    { name: "VIN", class: "power", nodes: ["U1.1"], isNamed: true },
    {
      name: "LED_ANODE",
      class: "signal",
      nodes: ["R1.2"],
      isNamed: true,
    },
  ],
  meta: { sheetCount: 1, componentCount: 3, netCount: 4 },
};

test("diffSnapshots detects value change and add", () => {
  const d = diffSnapshots(base, head, {
    baseRevisionId: "b",
    headRevisionId: "h",
  });
  assert.equal(d.summary.componentsAdded, 1);
  assert.equal(d.summary.componentsChanged, 1);
  const c12 = d.components.find((c) => c.refdes === "C12");
  assert.ok(c12);
  assert.equal(c12.kind, "changed");
  assert.ok(c12.fields?.includes("value"));
  assert.ok(c12.fields?.includes("mpn"));
  assert.ok(d.electrical);
  assert.ok((d.summary.significantElectrical ?? 0) >= 1);
});

test("localCopilotFindings risks includes C12 and missing MPN on R1", () => {
  const d = diffSnapshots(base, head, {
    baseRevisionId: "b",
    headRevisionId: "h",
  });
  const { findings } = localCopilotFindings(d, "/risks");
  assert.ok(findings.some((f) => f.evidence[0]?.ref === "C12"));
  assert.ok(findings.some((f) => f.evidence[0]?.ref === "R1"));
});

test("semanticDiff detects net rename by pin-set", () => {
  const a: DesignSnapshot = {
    ...base,
    nets: [
      {
        name: "LED_DRIVE",
        nodes: ["R1.1", "D1.1"],
        isNamed: true,
      },
    ],
    components: [
      {
        refdes: "R1",
        value: "10k",
        footprint: "R",
        sheetId: "root",
        pins: [{ number: "1", name: "~", net: "LED_DRIVE" }],
      },
      {
        refdes: "D1",
        value: "LED",
        footprint: "LED",
        sheetId: "root",
        pins: [{ number: "1", name: "~", net: "LED_DRIVE" }],
      },
    ],
  };
  const b: DesignSnapshot = {
    ...a,
    nets: [
      {
        name: "LED_ANODE",
        nodes: ["R1.1", "D1.1"],
        isNamed: true,
      },
    ],
    components: [
      {
        refdes: "R1",
        value: "10k",
        footprint: "R",
        sheetId: "root",
        pins: [{ number: "1", name: "~", net: "LED_ANODE" }],
      },
      {
        refdes: "D1",
        value: "LED",
        footprint: "LED",
        sheetId: "root",
        pins: [{ number: "1", name: "~", net: "LED_ANODE" }],
      },
    ],
  };
  const d = semanticDiff(a, b);
  assert.ok(d.changes.some((c) => c.type === "NetRenamed"));
  assert.equal(d.summary.gate, "FAIL");
});

test("semanticDiff flags pin rewire", () => {
  const a: DesignSnapshot = {
    schemaVersion: 1,
    tool: { name: "t" },
    sheets: [],
    components: [
      {
        refdes: "U1",
        value: "X",
        footprint: "F",
        sheetId: "root",
        pins: [
          { number: "7", name: "SDA", net: "GND" },
          { number: "8", name: "VSS", net: "GND" },
        ],
      },
    ],
    nets: [{ name: "GND", nodes: ["U1.7", "U1.8"] }],
    meta: { sheetCount: 1, componentCount: 1 },
  };
  const b: DesignSnapshot = {
    ...a,
    components: [
      {
        refdes: "U1",
        value: "X",
        footprint: "F",
        sheetId: "root",
        pins: [
          { number: "7", name: "SDA", net: "+3V3" },
          { number: "8", name: "VSS", net: "GND" },
        ],
      },
    ],
    nets: [
      { name: "+3V3", nodes: ["U1.7"] },
      { name: "GND", nodes: ["U1.8"] },
    ],
  };
  const d = semanticDiff(a, b);
  assert.ok(d.changes.some((c) => c.type === "PinConnectionChanged"));
  assert.ok(d.changes.some((c) => c.message.includes("U1.7")));
});

test("semanticDiff does not cross boardKey pin identities", () => {
  const a: DesignSnapshot = {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "R1",
        value: "10k",
        footprint: "R",
        sheetId: "root",
        boardKey: "alpha.kicad_pro",
        pins: [{ number: "1", name: "~", net: "NET_A" }],
      },
      {
        refdes: "R1",
        value: "10k",
        footprint: "R",
        sheetId: "root",
        boardKey: "beta.kicad_pro",
        pins: [{ number: "1", name: "~", net: "NET_B" }],
      },
    ],
    nets: [
      { name: "NET_A", nodes: ["R1.1"], boardKey: "alpha.kicad_pro" },
      { name: "NET_B", nodes: ["R1.1"], boardKey: "beta.kicad_pro" },
    ],
    meta: { sheetCount: 1, componentCount: 2, netCount: 2 },
  };
  const b: DesignSnapshot = {
    ...a,
    components: a.components.map((c) =>
      c.boardKey === "beta.kicad_pro"
        ? {
            ...c,
            pins: [{ number: "1", name: "~", net: "NET_B2" }],
          }
        : c,
    ),
    nets: [
      { name: "NET_A", nodes: ["R1.1"], boardKey: "alpha.kicad_pro" },
      { name: "NET_B2", nodes: ["R1.1"], boardKey: "beta.kicad_pro" },
    ],
  };
  const d = semanticDiff(a, b);
  assert.ok(
    d.changes.some(
      (c) =>
        (c.type === "NetRenamed" || c.type === "NetAdded" || c.type === "PinConnectionChanged") &&
        (c.message.includes("NET_B") || c.afterName === "NET_B2" || c.net === "NET_B2"),
    ),
  );
  assert.ok(
    !d.changes.some(
      (c) =>
        c.type === "PinConnectionChanged" &&
        (c.beforeNet === "NET_A" || c.afterNet === "NET_A"),
    ),
  );
});