import { test } from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "@solderlab/design-core";
import {
  executeBoardTool,
  get_component,
  get_net,
  get_bsc,
  get_decoupling,
  get_power_tree,
  run_checks,
  simulate_change,
  generate_firmware_patch,
  generate_bringup,
  generate_review_synthesis,
  generate_changelog,
  generate_commit_notes,
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
    ],
    nets: [
      { name: "3V3", class: "power", nodes: ["U1.1", "C1.1"] },
      { name: "GND", class: "ground", nodes: ["U1.8", "C1.2"] },
    ],
    meta: { sheetCount: 1, componentCount: 2, netCount: 2 },
  };
}

function hostFor(head: DesignSnapshot): ToolHost {
  return {
    head,
    headRevisionId: "head",
    snapshotFor: (id) => (id === "head" ? head : null),
    checksFor: () => [
      { name: "connectivity-gate", status: "pass", summary: "ok" },
    ],
  };
}

test("tools wrap snapshot/BSC/checks without inventing identifiers", () => {
  const head = snapshot();
  const host = hostFor(head);
  const net = get_net(host, "GND") as { name?: string };
  assert.equal(net.name, "GND");
  const missing = get_net(host, "VBUS_FAKE") as { error?: string };
  assert.ok(missing.error);
  const u1 = get_component(host, "U1") as { refdes?: string };
  assert.equal(u1.refdes, "U1");
  const bsc = get_bsc(host, "head") as { mcus?: Array<{ refdes: string }> };
  assert.ok(Array.isArray(bsc.mcus));
  const checks = run_checks(host, "head");
  assert.ok(Array.isArray(checks));
  assert.equal(checks[0]?.name, "connectivity-gate");
  const traced = executeBoardTool(host, "trace_from", {
    refdes: "U1",
    pin: "1",
    hops: 1,
  }) as { nets: string[] };
  assert.ok(traced.nets.includes("3V3"));
  const tree = get_power_tree(host) as { rails: Array<{ name: string }> };
  assert.ok(tree.rails.some((r) => r.name === "GND"));
  const decouple = get_decoupling(host, "U1") as {
    capacitors: Array<{ refdes: string }>;
  };
  assert.ok(decouple.capacitors.some((c) => c.refdes === "C1"));
});

test("simulate_change value-only is verified and does not mutate head", () => {
  const head = snapshot();
  const host = hostFor(head);
  const before = JSON.stringify(head);
  const out = simulate_change(host, [
    { op: "set_component_value", refdes: "C1", value: "1uF" },
  ]) as {
    id: string;
    verification: { status: string; coverage: number; netGraphDelta: { rewired: string[] } };
  };
  assert.equal(out.verification.status, "verified");
  assert.equal(out.verification.coverage, 1);
  assert.equal(out.verification.netGraphDelta.rewired.length, 0);
  assert.ok(out.id.startsWith("shadow-"));
  assert.equal(JSON.stringify(host.head), before);
  assert.equal(host.head.components.find((c) => c.refdes === "C1")?.value, "100nF");
});

test("simulate_change connect_pin reports an electrical delta", () => {
  const host = hostFor(snapshot());
  const out = simulate_change(host, [
    { op: "connect_pin", refdes: "C1", pin: "1", net: "GND" },
  ]) as {
    verification: {
      status: string;
      coverage: number;
      netGraphDelta: { rewired: string[] };
      checkDeltas: Array<{ name: string; after: string }>;
    };
  };
  assert.ok(out.verification.netGraphDelta.rewired.includes("GND"));
  assert.ok(out.verification.coverage <= 0.85);
  const gate = out.verification.checkDeltas.find((d) => d.name === "electricalGate");
  assert.equal(gate?.after, "FAIL");
  assert.notEqual(out.verification.status, "verified");
});

test("simulate_change missing refdes is refuted", () => {
  const host = hostFor(snapshot());
  const out = simulate_change(host, [
    { op: "set_component_value", refdes: "R99", value: "10k" },
  ]) as { verification: { status: string; refutations: string[] } };
  assert.equal(out.verification.status, "refuted");
  assert.ok(out.verification.refutations.some((r) => r.includes("R99")));
});

test("generate_firmware_patch is unverifiable without a firmware tree", () => {
  const host = hostFor(snapshot());
  const out = generate_firmware_patch(host) as { status?: string };
  assert.equal(out.status, "unverifiable");
});

test("generate_firmware_patch wraps emitC and does not invent pin numbers", async () => {
  const { generateBSC } = await import("@solderlab/bsc");
  const head = snapshot();
  const locked = generateBSC(head, { boardName: "demo" });
  const current = structuredClone(locked);
  const pin = current.pins[0];
  if (pin) pin.net = "HIJACKED";
  const host = hostFor(head);
  host.firmware = {
    locked,
    current,
    files: [
      {
        path: "src/main.c",
        contents: `#include "board.h"\nint main(void) { return 0; }\n`,
      },
    ],
  };
  const out = generate_firmware_patch(host) as {
    files: Array<{ path: string; contents: string }>;
  };
  const header = out.files.find((f) => f.path === "include/board.h")?.contents ?? "";
  assert.match(header, /SOLDERLAB_PIN_/);
  assert.match(header, /DO NOT EDIT/);
});

test("shadow ids cannot be used as revisions", () => {
  const host = hostFor(snapshot());
  const bsc = get_bsc(host, "shadow-abc") as { error?: string };
  assert.match(bsc.error ?? "", /not revisions/);
  const checks = run_checks(host, "shadow-abc") as { error?: string };
  assert.match(checks.error ?? "", /not revisions/);
});

test("generate_review_synthesis without base is unverifiable", () => {
  const host = hostFor(snapshot());
  const out = generate_review_synthesis(host) as { status?: string };
  assert.equal(out.status, "unverifiable");
});

test("A2–A5 tools are engine-owned; args cannot set electricalGate", () => {
  const base = snapshot();
  const head = snapshot();
  head.components = head.components.map((c) =>
    c.refdes === "C1" ? { ...c, value: "1uF" } : c,
  );
  const host = hostFor(head);
  host.base = base;
  host.baseRevisionId = "base";

  const bringup = generate_bringup(host) as { steps?: unknown[]; withheld?: unknown[] };
  assert.ok(Array.isArray(bringup.steps));

  const review = generate_review_synthesis(host) as {
    electricalGate: string | null;
    verdict: string;
  };
  assert.equal(review.verdict, "verified");
  const viaArgs = executeBoardTool(host, "generate_review_synthesis", {
    electricalGate: "PASS",
  }) as { electricalGate: string | null };
  assert.equal(viaArgs.electricalGate, review.electricalGate);

  const log = generate_changelog(host) as { entries: Array<{ refs: Array<{ ref: string }> }> };
  assert.ok(log.entries.some((e) => e.refs.some((r) => r.ref === "C1")));
  const notes = generate_commit_notes(host) as { electricalGate: string | null; subject: string };
  assert.equal(notes.electricalGate, review.electricalGate);
  assert.match(notes.subject, /electricalGate=/);
});

test("Tier B tools ignore extra args; missing datasheet table stays unverifiable", () => {
  const head = snapshot();
  const host = hostFor(head);
  const invented = executeBoardTool(host, "audit_substitution", {
    refdes: "U1",
    mpn: "FAKE-MPN-999",
    alternateMpns: ["FAKE-MPN-999"],
    candidates: [{ mpn: "FAKE-MPN-999" }],
  });
  assert.equal(JSON.stringify(invented).includes("FAKE-MPN-999"), false);

  host.bomPlatform = [{ refdes: "U1", alternateMpns: ["GD32F103C8T6"] }];
  const fromLib = executeBoardTool(host, "audit_substitution", {
    refdes: "U1",
  }) as Array<{ candidates: Array<{ mpn: string; source: string }> }>;
  assert.ok(
    fromLib[0]?.candidates.some(
      (c) => c.mpn === "GD32F103C8T6" && c.source === "library",
    ),
  );

  const decouple = executeBoardTool(host, "audit_decoupling", {
    recommendedCap: "47uF",
  }) as { gaps: unknown[]; rails: unknown[] };
  assert.ok(Array.isArray(decouple.gaps));
  assert.equal("recommendedCap" in decouple, false);
  assert.equal(JSON.stringify(decouple).includes("47uF"), false);

  const tps = executeBoardTool(host, "audit_test_points", {}) as {
    uncovered: string[];
  };
  assert.ok(Array.isArray(tps.uncovered));

  const nets = executeBoardTool(host, "audit_net_names", {
    name: "INVENTED_NET",
  }) as { anonymous: Array<{ name: string }> };
  assert.equal(
    nets.anonymous.some((n) => n.name === "INVENTED_NET"),
    false,
  );

  const pins = executeBoardTool(host, "lookup_pin_functions", {
    table: [{ mpn: "STM32F103", pinNumber: "1", function: "INVENTED_FN" }],
    function: "INVENTED_FN",
  }) as { status: string; matched: unknown[] };
  assert.equal(pins.status, "unverifiable");
  assert.equal(JSON.stringify(pins).includes("INVENTED_FN"), false);
});

test("physics tools wrap engine; extras cannot invent MPN or force verified", async () => {
  const { physicsBinaryAvailable } = await import("@solderlab/physics");
  if (!physicsBinaryAvailable()) {
    // Optional binary — same pattern as kicad-cli skips
    return;
  }
  const host = hostFor(snapshot());
  const dc = executeBoardTool(host, "solve_dc_circuit", {
    nodes: 2,
    stamps: [
      { kind: "V", a: 1, b: 0, value: 5 },
      { kind: "R", a: 1, b: 2, value: 10000 },
      { kind: "R", a: 2, b: 0, value: 10000 },
    ],
    probes: [{ name: "VOUT", node: 2, expected: 2.5 }],
    verified: true,
    mpn: "FAKE-MPN-999",
    voltage: 99,
  }) as {
    status: string;
    findingsText: string[];
    engineResults: { probes?: Array<{ voltage: number }> };
  };
  assert.equal(dc.status, "verified");
  assert.ok(Math.abs((dc.engineResults.probes?.[0]?.voltage ?? 0) - 2.5) < 1e-6);
  assert.equal(JSON.stringify(dc).includes("FAKE-MPN-999"), false);
  assert.ok(dc.findingsText.every((t) => /Engine/i.test(t)));

  const syn = executeBoardTool(host, "synthesize_topology_block", {
    topology: "resistor_divider",
    vin: 12,
    vout: 3.3,
    class: "verified",
    mpn: "INVENTED",
  }) as {
    outputClass: string;
    canGateMerge: boolean;
    classified: { class: string };
  };
  assert.equal(syn.canGateMerge, false);
  assert.equal(syn.outputClass, "proposed");
  assert.equal(syn.classified.class, "proposed");
  assert.equal(JSON.stringify(syn).includes("INVENTED") && syn.classified.class === "verified", false);

  const float = executeBoardTool(host, "solve_dc_circuit", {
    nodes: 2,
    stamps: [{ kind: "R", a: 1, b: 2, value: 100 }],
  }) as { status: string };
  assert.equal(float.status, "refuted");
});

