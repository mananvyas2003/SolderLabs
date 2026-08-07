import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnintendedConnectivity } from "../unintended-connectivity.ts";
import { reconcileBom } from "../bom-reconcile.ts";
import { blameBomLine } from "../bom-history.ts";
import { lintManufacturingPackage } from "../mfg-lint.ts";

test("unintended connectivity flags unspoken net membership change", () => {
  const findings = findUnintendedConnectivity(
    {
      nets: [
        {
          name: "SPI_MOSI",
          kind: "changed",
          beforeNodes: ["U1.11"],
          afterNodes: ["U1.11", "U2.3"],
        },
      ],
    },
    "Bump R12 to 4.7k for LED brightness",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.net, "SPI_MOSI");

  const ok = findUnintendedConnectivity(
    {
      nets: [
        {
          name: "SPI_MOSI",
          kind: "changed",
          beforeNodes: ["U1.11"],
          afterNodes: ["U1.11", "U2.3"],
        },
      ],
    },
    "Rewire SPI_MOSI to U2",
  );
  assert.equal(ok.length, 0);
});

test("BOM reconcile detects stale MPN after value change", () => {
  const drift = reconcileBom(
    [
      {
        refdes: "U7",
        value: "3.0V",
        footprint: "SOT-23-5",
        uuid: "abc",
        sheetId: "root",
      },
    ],
    [
      {
        refdes: "U7",
        uuid: "abc",
        mpn: "AP2112K-3.3TRG1",
        lockedValue: "3.3V",
        lockedFootprint: "SOT-23-5",
      },
    ],
  );
  assert.ok(drift.some((d) => d.kind === "value_changed_mpn_stale"));
});

test("BOM blame records when R12 value changed", () => {
  const events = blameBomLine([
    {
      revisionId: "r1",
      createdAt: "2026-01-01T00:00:00Z",
      authorName: "Ada",
      message: "initial",
      refdes: "R12",
      uuid: "u-r12",
      value: "10k",
      footprint: "0402",
      mpn: "RC0402-10K",
    },
    {
      revisionId: "r2",
      createdAt: "2026-01-02T00:00:00Z",
      authorName: "Ada",
      message: "LED brightness",
      reviewId: "rev-1",
      refdes: "R12",
      uuid: "u-r12",
      value: "4.7k",
      footprint: "0402",
      mpn: "RC0402-4K7",
    },
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[1]!.changedFields.sort(), ["mpn", "value"].sort());
  assert.equal(events[1]!.before?.value, "10k");
  assert.equal(events[1]!.after.value, "4.7k");
});

test("mfg linter catches PnP ref missing from BOM and missing MPN", () => {
  const r = lintManufacturingPackage({
    bom: [
      { refdes: "R1", mpn: null, value: "10k" },
      { refdes: "C1", mpn: "CL05B104", value: "100n" },
    ],
    placement: [
      { refdes: "R1" },
      { refdes: "U99" },
      { refdes: "C1" },
    ],
    gerberLayers: [{ name: "F.Cu" }, { name: "B.Cu" }],
    declaredStackup: [{ name: "F.Cu", type: "copper" }, { name: "B.Cu", type: "copper" }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.code === "pnp_unknown_refdes" && f.ref === "U99"));
  assert.ok(r.findings.some((f) => f.code === "bom_missing_mpn" && f.ref === "R1"));
});
