import { test } from "node:test";
import assert from "node:assert/strict";
import {
  physicsBinaryAvailable,
  solveDc,
} from "../index.ts";

test("golden: 5V divider → 2.5V on node 2", (t) => {
  if (!physicsBinaryAvailable()) {
    t.skip("solderlab-physics binary missing — npm run build -w @solderlab/physics-engine");
    return;
  }
  const res = solveDc({
    nodes: 2,
    stamps: [
      { kind: "V", a: 1, b: 0, value: 5 },
      { kind: "R", a: 1, b: 2, value: 10000 },
      { kind: "R", a: 2, b: 0, value: 10000 },
    ],
    probes: [{ name: "VOUT", node: 2, expected: 2.5 }],
  });
  assert.equal(res.status, "verified");
  assert.equal(res.ok, true);
  const probes = res.engineResults.probes as Array<{ voltage: number }>;
  assert.ok(Array.isArray(probes) && probes.length === 1);
  assert.ok(Math.abs(probes[0]!.voltage - 2.5) < 1e-6);
  assert.ok(res.findings.some((f) => f.type === "voltage_result"));
});

test("floating node → refuted singular", (t) => {
  if (!physicsBinaryAvailable()) {
    t.skip("solderlab-physics binary missing");
    return;
  }
  const res = solveDc({
    nodes: 2,
    stamps: [{ kind: "R", a: 1, b: 2, value: 100 }],
  });
  assert.equal(res.status, "refuted");
  assert.equal(res.engineResults.singular, true);
  assert.ok(res.errors.some((e) => /singular/i.test(e)));
});
