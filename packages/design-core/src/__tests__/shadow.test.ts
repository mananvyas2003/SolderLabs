import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "../types.ts";
import { diffSnapshots } from "../index.ts";
import {
  createShadowSnapshot,
  isShadowId,
  type ChangeOperation,
} from "../shadow.ts";

function snap(): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "C12",
        value: "100nF",
        footprint: "C_0402",
        mpn: "CL05B104KO5NNNC",
        sheetId: "root",
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
}

test("value-only change is verified and does not rewire nets", () => {
  const base = snap();
  const shadow = createShadowSnapshot(base, [
    { op: "set_component_value", refdes: "C12", value: "1uF" },
  ]);
  assert.equal(isShadowId(shadow.id), true);
  assert.equal(shadow.verification.status, "verified");
  assert.equal(shadow.verification.coverage, 1);
  assert.deepEqual(shadow.verification.netGraphDelta, {
    added: [],
    removed: [],
    rewired: [],
  });
  const c12 = shadow.derived.components.find((c) => c.refdes === "C12");
  assert.equal(c12?.value, "1uF");
  assert.equal(base.components.find((c) => c.refdes === "C12")?.value, "100nF");
});

test("connect_pin rebuilds nets and reports an electrical delta", () => {
  const base = snap();
  const shadow = createShadowSnapshot(base, [
    { op: "connect_pin", refdes: "C12", pin: "1", net: "VIN" },
  ]);
  assert.equal(shadow.verification.status, "verified_with_warnings");
  assert.ok(shadow.verification.coverage <= 0.85);
  assert.ok(shadow.verification.netGraphDelta.rewired.includes("VIN"));
  assert.ok(shadow.verification.netGraphDelta.rewired.includes("VDD"));
  const vdd = shadow.derived.nets.find((n) => n.name === "VDD");
  const vin = shadow.derived.nets.find((n) => n.name === "VIN");
  assert.equal(vdd?.nodes.includes("C12.1"), false);
  assert.equal(vin?.nodes.includes("C12.1"), true);
  const gate = shadow.verification.checkDeltas.find((d) => d.name === "electricalGate");
  assert.equal(gate?.after, "FAIL");
});

test("missing refdes is refuted with an engine reason", () => {
  const shadow = createShadowSnapshot(snap(), [
    { op: "set_component_value", refdes: "R99", value: "10k" },
  ]);
  assert.equal(shadow.verification.status, "refuted");
  assert.ok(
    shadow.verification.refutations.some((r) => r.includes("R99")),
    shadow.verification.refutations.join("; "),
  );
  assert.equal(shadow.verification.coverage, 0);
});

test("host snapshot is not mutated by a shadow", () => {
  const base = snap();
  const before = JSON.stringify(base);
  const gateBefore = diffSnapshots(base, base, {
    baseRevisionId: "head",
    headRevisionId: "head",
  }).summary.electricalGate;
  createShadowSnapshot(base, [
    { op: "connect_pin", refdes: "C12", pin: "1", net: "VIN" },
    { op: "set_component_value", refdes: "C12", value: "22uF" },
  ]);
  assert.equal(JSON.stringify(base), before);
  const gateAfter = diffSnapshots(base, base, {
    baseRevisionId: "head",
    headRevisionId: "head",
  }).summary.electricalGate;
  assert.equal(gateAfter, gateBefore);
  assert.equal(gateAfter, "PASS");
});

test("a shadow id is never a revision id", () => {
  const ops: ChangeOperation[] = [
    { op: "set_component_mpn", refdes: "U1", mpn: "AP2112K-3.3TRG1" },
  ];
  const shadow = createShadowSnapshot(snap(), ops, { baseRevisionId: "rev-head" });
  assert.equal(isShadowId(shadow.id), true);
  assert.equal(isShadowId(shadow.baseRevisionId), false);
  assert.equal(shadow.id.startsWith("shadow-"), true);
  assert.notEqual(shadow.id, "rev-head");
});
