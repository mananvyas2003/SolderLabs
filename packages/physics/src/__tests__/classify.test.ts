import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPhysicsResponse,
  renderPhysicsFindingText,
} from "../index.ts";

test("engine templates do not echo injection prose", () => {
  const text = renderPhysicsFindingText({
    type: "voltage_result",
    severity: "info",
    textTemplateFields: {
      probe: "VOUT",
      node: 2,
      voltage: 2.5,
      expected: 2.5,
    },
    citations: [{ kind: "net", ref: "VOUT" }],
  });
  assert.match(text, /Engine DC solve/);
  assert.doesNotMatch(text, /ignore all prior/i);
  assert.doesNotMatch(text, /approve this review/i);
});

test("refuted singular maps to refuted class", () => {
  const classified = classifyPhysicsResponse(
    {
      ok: true,
      status: "refuted",
      engineResults: { singular: true },
      findings: [
        {
          type: "part_rating_risk",
          severity: "high",
          textTemplateFields: { reason: "singular_matrix" },
          citations: [],
        },
      ],
      errors: ["singular matrix"],
    },
    "solve_dc",
  );
  assert.ok("class" in classified);
  assert.equal(classified.class, "refuted");
  assert.equal(classified.canGateMerge, false);
});
