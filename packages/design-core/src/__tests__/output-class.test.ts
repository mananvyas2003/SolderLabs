import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADVISORY_LABEL,
  canGateMerge,
  classifyAdvisoryText,
  classifyElectricalGate,
  classifyProposal,
  isWithheld,
} from "../output-class.ts";

test("a passing simulate_change is Proposed, never Verified, and cannot gate merge", () => {
  const out = classifyProposal(
    {
      verification: {
        status: "verified",
        coverage: 1,
        refutations: [],
      },
    },
    { class: "verified", canGateMerge: true, electricalGate: "PASS" },
  );
  assert.equal(isWithheld(out), false);
  if (isWithheld(out)) return;
  assert.equal(out.class, "proposed");
  assert.equal(out.canGateMerge, false);
  assert.equal(out.coverage, 1);
  assert.equal(out.verdict, "verified");
  assert.equal(canGateMerge(out.class), false);
});

test("a refuted proposal keeps the engine reason and cannot gate merge", () => {
  const out = classifyProposal({
    status: "refuted",
    coverage: 0,
    refutations: ["R99 not found"],
  });
  assert.equal(isWithheld(out), false);
  if (isWithheld(out)) return;
  assert.equal(out.class, "refuted");
  assert.equal(out.reason, "R99 not found");
  assert.equal(out.canGateMerge, false);
  assert.equal(out.coverage, 0);
});

test("unverifiable proposals are withheld, not labelled verified", () => {
  const out = classifyProposal({
    status: "unverifiable",
    coverage: 0,
    refutations: ["resolver could not rebuild nets"],
  });
  assert.equal(isWithheld(out), true);
  if (!isWithheld(out)) return;
  assert.match(out.reason, /rebuild nets/);
});

test("advisory text is permanently labelled and cannot gate merge", () => {
  const out = classifyAdvisoryText("maybe add a copper pour");
  assert.equal(out.class, "advisory");
  assert.equal(out.banner, ADVISORY_LABEL);
  assert.equal(out.canGateMerge, false);
  assert.equal(out.text, "maybe add a copper pour");
});

test("electricalGate is verified engine output; model cannot supply it", () => {
  const gate = classifyElectricalGate("FAIL");
  assert.equal(gate.class, "verified");
  assert.equal(gate.verdict, "FAIL");
  assert.equal(gate.canGateMerge, true);
  assert.equal(canGateMerge("advisory"), false);
  assert.equal(canGateMerge("proposed"), false);
  assert.equal(canGateMerge("refuted"), false);
});
