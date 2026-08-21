import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPhysicsResponse,
  physicsBinaryAvailable,
  synthesizeTopology,
} from "../index.ts";

test("synthesize resistor_divider binds parts and classifies Proposed", (t) => {
  if (!physicsBinaryAvailable()) {
    t.skip("solderlab-physics binary missing");
    return;
  }
  const res = synthesizeTopology({
    topology: "resistor_divider",
    vin: 12,
    vout: 3.3,
  });
  assert.equal(res.ok, true);
  assert.equal(res.status, "verified");
  const bindings = res.engineResults.bindings as Array<{ bound: boolean; mpn: string }>;
  assert.ok(Array.isArray(bindings) && bindings.length >= 1);
  assert.ok(bindings.some((b) => b.bound && b.mpn));

  const classified = classifyPhysicsResponse(res, "synthesize");
  assert.ok(!("withheld" in classified && classified.withheld));
  if ("class" in classified) {
    assert.equal(classified.class, "proposed");
    assert.equal(classified.canGateMerge, false);
  }
});
