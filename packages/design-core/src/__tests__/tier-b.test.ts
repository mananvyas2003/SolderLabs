import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "../types.ts";
import type { BomPlatformMeta } from "../bom-reconcile.ts";
import {
  auditDecoupling,
  auditNetNames,
  auditSubstitutions,
  auditTestPointCoverage,
  listDecouplingForRefdes,
} from "../tier-b.ts";

function board(): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "U1",
        value: "STM32F103C8T6",
        footprint: "LQFP-48",
        mpn: "STM32F103C8T6",
        sheetId: "root",
        pins: [
          { number: "1", name: "VDD", net: "3V3" },
          { number: "8", name: "GND", net: "GND" },
          { number: "10", name: "SDA", net: "Net-(U1-Pad10)" },
        ],
      },
      {
        refdes: "U2",
        value: "STM32F103C8T6",
        footprint: "LQFP-48",
        mpn: "STM32F103C8T6-TR",
        sheetId: "root",
        pins: [
          { number: "1", name: "VDD", net: "3V3" },
          { number: "8", name: "GND", net: "GND" },
        ],
      },
      {
        refdes: "C1",
        value: "100nF",
        footprint: "C_0402",
        sheetId: "root",
        pins: [
          { number: "1", name: "1", net: "3V3" },
          { number: "2", name: "2", net: "GND" },
        ],
      },
      {
        refdes: "TP1",
        value: "TestPoint",
        footprint: "TestPoint",
        sheetId: "root",
        pins: [{ number: "1", name: "~", net: "3V3" }],
      },
    ],
    nets: [
      { name: "3V3", class: "power", nodes: ["U1.1", "U2.1", "C1.1", "TP1.1"] },
      { name: "GND", class: "ground", nodes: ["U1.8", "U2.8", "C1.2"] },
      { name: "Net-(U1-Pad10)", nodes: ["U1.10"] },
    ],
    meta: { sheetCount: 1, componentCount: 4, netCount: 3 },
  };
}

test("B1 substitutions come from the board or library, never invented", () => {
  const snap = board();
  const rows = auditSubstitutions(snap);
  const u1 = rows.find((r) => r.refdes === "U1");
  assert.ok(u1);
  assert.equal(u1!.candidates.some((c) => c.mpn === "STM32F103C8T6-TR"), true);
  assert.equal(u1!.candidates.some((c) => c.source === "board"), true);
  assert.equal(u1!.status, "verified");
  const platform: BomPlatformMeta[] = [
    { refdes: "U1", alternateMpns: ["GD32F103C8T6"] },
  ];
  const withLib = auditSubstitutions(snap, platform, "U1");
  assert.ok(withLib[0]!.candidates.some((c) => c.mpn === "GD32F103C8T6" && c.source === "library"));
  assert.equal(
    withLib[0]!.candidates.some((c) => c.mpn === "FAKE123"),
    false,
  );
});

test("B1 with no alternates is unverifiable, not a guessed MPN", () => {
  const snap = board();
  snap.components = snap.components.filter((c) => c.refdes !== "U2");
  const rows = auditSubstitutions(snap, [], "U1");
  assert.equal(rows[0]!.status, "unverifiable");
  assert.equal(rows[0]!.candidates.length, 0);
});

test("B2 decoupling reports C1 on 3V3 and a gap when the cap is removed", () => {
  const snap = board();
  const ok = auditDecoupling(snap);
  assert.equal(ok.gaps.length, 0);
  assert.ok(ok.rails.some((r) => r.net === "3V3" && r.capacitors.includes("C1")));
  const listed = listDecouplingForRefdes(snap, "U1");
  assert.ok(!("error" in listed));
  if (!("error" in listed)) {
    assert.ok(listed.capacitors.some((c) => c.refdes === "C1"));
  }
  snap.components = snap.components.filter((c) => c.refdes !== "C1");
  const gap = auditDecoupling(snap);
  assert.ok(gap.gaps.some((g) => g.refdes === "U1" && g.net === "3V3"));
});

test("B3 test-point coverage: 3V3 covered, GND uncovered", () => {
  const cov = auditTestPointCoverage(board());
  assert.ok(cov.covered.some((c) => c.net === "3V3" && c.testPoints.includes("TP1")));
  assert.ok(cov.uncovered.includes("GND"));
  assert.ok(cov.coverage < 1);
});

test("B4 anonymous nets expose pin names already on the net", () => {
  const audit = auditNetNames(board());
  const row = audit.anonymous.find((n) => n.name === "Net-(U1-Pad10)");
  assert.ok(row);
  assert.deepEqual(row!.pinNames, ["SDA"]);
  assert.equal(row!.derivedFromPins, "SDA");
  assert.equal(audit.anonymous.some((n) => n.name === "3V3"), false);
});
