import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "@solderlab/design-core";
import {
  executeBoardTool,
  get_component,
  get_net,
  get_bsc,
  run_checks,
  type ToolHost,
} from "../index.ts";

function snapshot(): DesignSnapshot {
  return {
    schemaVersion: 1,
    tool: { name: "kicad" },
    sheets: [{ id: "root", name: "Root" }],
    components: [
      {
        refdes: "U1",
        value: "STM32F103",
        footprint: "LQFP-48",
        libId: "MCU_ST_STM32F1:STM32F103C8Tx",
        sheetId: "root",
        pins: [
          { number: "1", name: "VDD", net: "3V3" },
          { number: "8", name: "GND", net: "GND" },
        ],
      },
    ],
    nets: [
      { name: "3V3", class: "power", nodes: ["U1.1"] },
      { name: "GND", class: "ground", nodes: ["U1.8"] },
    ],
    meta: { sheetCount: 1, componentCount: 1, netCount: 2 },
  };
}

test("tools wrap snapshot/BSC/checks without inventing identifiers", () => {
  const head = snapshot();
  const host: ToolHost = {
    head,
    snapshotFor: (id) => (id === "head" ? head : null),
    checksFor: () => [
      { name: "connectivity-gate", status: "pass", summary: "ok" },
    ],
  };
  const net = get_net(host, "GND") as { name?: string };
  assert.equal(net.name, "GND");
  const missing = get_net(host, "VBUS_FAKE") as { error?: string };
  assert.ok(missing.error);
  const u1 = get_component(host, "U1") as { refdes?: string };
  assert.equal(u1.refdes, "U1");
  const bsc = get_bsc(host, "head") as { mcus?: Array<{ refdes: string }> };
  assert.ok(Array.isArray(bsc.mcus));
  const checks = run_checks(host, "head");
  assert.equal(checks[0]?.name, "connectivity-gate");
  const traced = executeBoardTool(host, "trace_from", {
    refdes: "U1",
    pin: "1",
    hops: 1,
  }) as { nets: string[] };
  assert.ok(traced.nets.includes("3V3"));
});
