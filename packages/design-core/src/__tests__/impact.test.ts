import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "../types.ts";
import type { ImpactDiffBundle } from "../impact.ts";
import {
  analyzeBomImpact,
  analyzeImpactSync,
  analyzeInFlightTransmittals,
  analyzeTestInvalidation,
  collectConnectedComponents,
  collectTouchedNets,
  gateImpactClaims,
  localElectricalReasoning,
  analyzeImpactDeterministic,
} from "../impact.ts";

function snap(): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "R1",
        value: "10k",
        footprint: "R_0402",
        sheetId: "root",
        pins: [
          { number: "1", name: "1", net: "VOUT" },
          { number: "2", name: "2", net: "GND" },
        ],
      },
      {
        refdes: "U7",
        value: "AP2112K-3.3",
        footprint: "SOT-23-5",
        libId: "Regulator_Linear:AP2112K-3.3",
        mpn: "AP2112K-3.3TRG1",
        sheetId: "root",
        pins: [
          { number: "1", name: "VIN", net: "VOUT" },
          { number: "2", name: "GND", net: "GND" },
        ],
      },
      {
        refdes: "C1",
        value: "100nF",
        footprint: "C_0402",
        sheetId: "root",
        pins: [
          { number: "1", name: "1", net: "VOUT" },
          { number: "2", name: "2", net: "GND" },
        ],
      },
    ],
    nets: [
      {
        name: "VOUT",
        nodes: ["R1.1", "U7.1", "C1.1"],
      },
      { name: "GND", nodes: ["R1.2", "U7.2", "C1.2"] },
    ],
    meta: { sheetCount: 1, componentCount: 3, netCount: 2 },
  };
}

function baseDiff(partial: Partial<ImpactDiffBundle> = {}): ImpactDiffBundle {
  return {
    baseRevisionId: "base",
    headRevisionId: "head",
    components: [
      {
        refdes: "R1",
        kind: "changed",
        fields: ["value"],
        before: {
          refdes: "R1",
          value: "10k",
          footprint: "R_0402",
          sheetId: "root",
        },
        after: {
          refdes: "R1",
          value: "4.7k",
          footprint: "R_0402",
          sheetId: "root",
        },
      },
    ],
    bom: [
      {
        refdes: "R1",
        kind: "changed",
        fields: ["value", "mpn"],
        before: { refdes: "R1", value: "10k", footprint: "R_0402", mpn: "RC0402-10K" },
        after: { refdes: "R1", value: "4.7k", footprint: "R_0402", mpn: "RC0402-4K7" },
      },
    ],
    nets: [],
    ...partial,
  };
}

test("step1: touched nets propagate to connected components via graph", () => {
  const snapshot = snap();
  const diff = baseDiff();
  const touched = collectTouchedNets(diff, snapshot);
  assert.ok(touched.some((n) => n.net === "VOUT"));
  assert.ok(touched.some((n) => n.net === "GND"));

  const connected = collectConnectedComponents(diff, snapshot, touched);
  const refs = connected.map((c) => c.refdes).sort();
  assert.deepEqual(refs, ["C1", "R1", "U7"]);
  assert.equal(connected.find((c) => c.refdes === "R1")?.reason, "changed");
  assert.equal(
    connected.find((c) => c.refdes === "U7")?.reason,
    "on_touched_net",
  );
});

test("step2+3: BSC surface and BOM cost / single-source", () => {
  const bom = analyzeBomImpact(
    [
      {
        refdes: "U2",
        kind: "added",
        after: {
          refdes: "U2",
          value: "widget",
          footprint: "QFN",
          mpn: "ONLY-ONE-SRC",
        },
      },
    ],
    {
      "ONLY-ONE-SRC": {
        unitCostUsd: 1.25,
        leadTimeDays: 14,
        suppliers: ["AcmeSole"],
      },
    },
  );
  assert.equal(bom.costDeltaUsd, 1.25);
  assert.equal(bom.leadTimeDeltaDays, 14);
  assert.deepEqual(bom.singleSourceIntroduced, ["ONLY-ONE-SRC"]);
  assert.equal(bom.lines[0]!.introducesSingleSource, true);
});

test("step4: open transmittals on superseded revision flagged", () => {
  const rows = analyzeInFlightTransmittals(
    [
      {
        supplierId: "sup1",
        supplierName: "PCBWay",
        revisionId: "rev-old",
      },
      {
        supplierId: "sup2",
        supplierName: "JLC",
        revisionId: "head",
      },
    ],
    "rev-old",
    "head",
  );
  assert.equal(rows.find((r) => r.supplierId === "sup1")?.superseded, true);
  assert.equal(rows.find((r) => r.supplierId === "sup2")?.superseded, false);
});

test("step5: overlapping test evidence is invalidated", () => {
  const snapshot = snap();
  const ground = analyzeImpactDeterministic(baseDiff(), { snapshot });
  const inv = analyzeTestInvalidation(
    [
      {
        id: "t1",
        name: "Power rail bring-up",
        revisionId: "base",
        status: "pass",
        nets: ["VOUT"],
      },
      {
        id: "t2",
        name: "USB eye",
        revisionId: "base",
        status: "pass",
        nets: ["USB_DP"],
      },
    ],
    ground.touchedNets,
    ground.connectedComponents,
  );
  assert.equal(inv.length, 1);
  assert.equal(inv[0]!.testId, "t1");
  assert.ok(inv[0]!.citations.some((c) => c.kind === "net" && c.ref === "VOUT"));
});

test("step6: gate drops uncited claims; marks unknown citations unverified", () => {
  const snapshot = snap();
  const ground = analyzeImpactDeterministic(baseDiff(), { snapshot });
  const gated = gateImpactClaims(
    [
      {
        text: "R1 change may starve U7",
        citations: [
          { kind: "component", ref: "R1" },
          { kind: "component", ref: "U7" },
        ],
      },
      {
        text: "Fantasy about Z99",
        citations: [{ kind: "component", ref: "Z99" }],
      },
      {
        text: "No citation noise",
        citations: [],
      },
    ],
    ground,
  );
  assert.equal(gated.grounded.length, 1);
  assert.equal(gated.unverified.length, 1);
  assert.equal(gated.dropped.length, 1);
  assert.equal(gated.grounded[0]!.grounded, true);
  assert.equal(gated.unverified[0]!.grounded, false);
});

test("local electrical reasoning cites R1 and regulator neighbor", () => {
  const snapshot = snap();
  const diff = baseDiff();
  const ground = analyzeImpactDeterministic(diff, { snapshot });
  const claims = localElectricalReasoning(diff, ground, snapshot);
  assert.ok(claims.length >= 1);
  const hit = claims.find((c) => c.text.includes("U7"));
  assert.ok(hit);
  assert.ok(hit!.citations.some((c) => c.ref === "R1"));
  assert.ok(hit!.citations.some((c) => c.ref === "U7"));
});

test("analyzeImpactSync drafts ECO with firmware approval on breaking BSC", () => {
  const snapshot = snap();
  const report = analyzeImpactSync(baseDiff(), {
    snapshot,
    bscChanges: [
      {
        kind: "pin_reassigned",
        severity: "breaking",
        message: "SDA moved from PB7 to PB9",
      },
    ],
    openTransmittals: [
      { supplierId: "s1", supplierName: "PCBWay", revisionId: "base" },
    ],
    testEvidence: [
      {
        id: "t1",
        name: "Rail test",
        revisionId: "base",
        status: "pass",
        components: ["R1"],
      },
    ],
    releasedRevisionId: "base",
    headRevisionId: "head",
    pricingByMpn: {
      "RC0402-10K": { unitCostUsd: 0.01, leadTimeDays: 7, suppliers: ["A", "B"] },
      "RC0402-4K7": { unitCostUsd: 0.02, leadTimeDays: 21, suppliers: ["A"] },
    },
  });

  assert.ok(report.eco.title.startsWith("ECO:"));
  assert.ok(report.eco.requiredApprovals.includes("Firmware owner"));
  assert.ok(report.eco.requiredApprovals.includes("Supplier quality / NPI"));
  assert.ok(report.invalidatedTests.length >= 1);
  assert.ok(report.inFlight.some((t) => t.superseded));
  assert.ok(
    report.eco.suggestedVerification.some((s) =>
      s.includes("solderlab bsc check"),
    ),
  );
});
