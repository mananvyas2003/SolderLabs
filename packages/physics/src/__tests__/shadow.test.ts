import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createShadowSnapshot,
  type DesignSnapshot,
} from "@solderlab/design-core";
import {
  enrichShadowWithDcSolve,
  physicsBinaryAvailable,
} from "../index.ts";

function snap(): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "R1",
        value: "10k",
        footprint: "",
        sheetId: "root",
        pins: [
          { number: "1", name: "1", net: "VIN" },
          { number: "2", name: "2", net: "VOUT" },
        ],
      },
    ],
    nets: [
      { name: "VIN", nodes: ["R1.1"] },
      { name: "VOUT", nodes: ["R1.2"] },
    ],
    meta: { sheetCount: 1, componentCount: 1, netCount: 2 },
  };
}

test("enrichShadowWithDcSolve refutes floating stamps", (t) => {
  if (!physicsBinaryAvailable()) {
    t.skip("solderlab-physics binary missing");
    return;
  }
  const shadow = createShadowSnapshot(snap(), [
    { op: "set_component_value", refdes: "R1", value: "1k" },
  ]);
  const enriched = enrichShadowWithDcSolve(shadow, {
    nodes: 2,
    stamps: [{ kind: "R", a: 1, b: 2, value: 100 }],
  });
  assert.equal(enriched.verification.status, "refuted");
  assert.ok(
    enriched.verification.checkDeltas.some((d) => d.name === "physics-dc"),
  );
});
