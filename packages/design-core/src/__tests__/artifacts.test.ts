import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "../types.ts";
import { diffSnapshots } from "../index.ts";
import {
  diffIdentifierUniverse,
  generateChangelog,
  generateCommitNotes,
  generateReviewSynthesis,
} from "../artifacts.ts";

function snap(value: string): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "R1",
        value,
        footprint: "R_0402",
        sheetId: "root",
        pins: [
          { number: "1", name: "1", net: "VOUT" },
          { number: "2", name: "2", net: "GND" },
        ],
      },
    ],
    nets: [
      { name: "VOUT", nodes: ["R1.1"] },
      { name: "GND", nodes: ["R1.2"] },
    ],
    meta: { sheetCount: 1, componentCount: 1, netCount: 2 },
  };
}

test("review synthesis copies electricalGate; extra args cannot override it", () => {
  const diff = diffSnapshots(snap("10k"), snap("12k"), {
    baseRevisionId: "base",
    headRevisionId: "head",
  });
  const review = generateReviewSynthesis(diff, {
    checks: [{ name: "connectivity-gate", status: "pass", summary: "ok" }],
  });
  assert.equal(review.electricalGate, diff.summary.electricalGate);
  assert.equal(review.verdict, "verified");
  assert.equal(review.checks[0]?.status, "pass");
  const forged = generateReviewSynthesis(
    { ...diff, summary: { ...diff.summary, electricalGate: diff.summary.electricalGate } },
    { checks: [{ name: "connectivity-gate", status: "FAIL", summary: "model says fail" }] },
  );
  assert.equal(forged.electricalGate, diff.summary.electricalGate);
  assert.equal(forged.summary.electricalGate, diff.summary.electricalGate);
});

test("changelog and commit notes only name identifiers from the diff", () => {
  const diff = diffSnapshots(snap("10k"), snap("12k"), {
    baseRevisionId: "base",
    headRevisionId: "head",
  });
  const allowed = diffIdentifierUniverse(diff);
  const log = generateChangelog(diff);
  for (const e of log.entries) {
    for (const r of e.refs) {
      assert.ok(allowed.has(r.ref), `changelog invented ${r.ref}`);
    }
  }
  assert.ok(log.entries.some((e) => e.refs.some((r) => r.ref === "R1")));
  const notes = generateCommitNotes(diff);
  assert.match(notes.subject, /electricalGate=/);
  assert.match(notes.trailers.join("\n"), /Electrical-Gate:/);
  assert.equal(notes.body.includes("U99"), false);
  assert.equal(notes.electricalGate, diff.summary.electricalGate);
});
