import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffSnapshots,
  localCopilotFindings,
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
    },
    {
      refdes: "U1",
      value: "AP2112K",
      footprint: "SOT-23-5",
      mpn: "AP2112K-3.3TRG1",
      sheetId: "root",
      x: 40,
      y: 20,
    },
  ],
  nets: [{ name: "VDD", class: "power", nodes: ["U1.1", "C12.1"] }],
  meta: { sheetCount: 1, componentCount: 2, netCount: 1 },
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
    },
    {
      refdes: "U1",
      value: "AP2112K",
      footprint: "SOT-23-5",
      mpn: "AP2112K-3.3TRG1",
      sheetId: "root",
      x: 40,
      y: 20,
    },
    {
      refdes: "R1",
      value: "10k",
      footprint: "R_0402",
      sheetId: "root",
      x: 60,
      y: 20,
    },
  ],
  nets: [
    { name: "VDD", class: "power", nodes: ["U1.1", "C12.1"] },
    { name: "N$1", class: "signal", nodes: ["R1.1", "U1.4"] },
  ],
  meta: { sheetCount: 1, componentCount: 3, netCount: 2 },
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
