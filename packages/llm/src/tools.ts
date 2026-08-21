import {
  auditDecoupling,
  auditNetNames,
  auditSubstitutions,
  auditTestPointCoverage,
  blameAllBomLines,
  cloneSnapshot,
  createShadowSnapshot,
  diffSnapshots,
  generateChangelog,
  generateCommitNotes,
  generateReviewSynthesis,
  isShadowId,
  listDecouplingForRefdes,
  snapshotToBom,
  type BomPlatformMeta,
  type ChangeOperation,
  type DesignSnapshot,
} from "@solderlab/design-core";
import {
  diffBSC,
  generateBSC,
  generateBringUpScript,
  generateFirmwarePatch,
  isPowerRailNet,
  lookupPinFunctions,
  type BoardSupportContract,
  type FirmwareFile,
  type PinFunctionRecord,
} from "@solderlab/bsc";
import {
  classifyPhysicsResponse,
  findPartCandidates,
  renderPhysicsFindings,
  solveDc,
  synthesizeTopology,
  type PhysicsStamp,
} from "@solderlab/physics";
import type { LlmToolSpec } from "./types.ts";

export interface ToolCheckRow {
  name: string;
  status: string;
  summary: string | null;
}

export interface ToolHost {
  snapshotFor(revisionId: string): DesignSnapshot | null;
  head: DesignSnapshot;
  base?: DesignSnapshot | null;
  baseRevisionId?: string;
  headRevisionId?: string;
  checksFor?(revisionId: string): ToolCheckRow[];
  bomRevisionsFor?(revisionId: string): Array<{
    revisionId: string;
    createdAt: string;
    lines: Array<{
      refdes: string;
      uuid?: string;
      value: string;
      footprint: string;
      mpn?: string | null;
      manufacturer?: string | null;
    }>;
  }>;
  partSupplyFor?(mpn: string): unknown;
  searchDatasheet?(mpn: string, query: string): unknown;
  firmware?: {
    locked: BoardSupportContract;
    current: BoardSupportContract;
    files: FirmwareFile[];
  };
  /** Library second-sources. Never accepted from tool arguments. */
  bomPlatform?: BomPlatformMeta[];
  /** Datasheet pin-function rows. Never accepted from tool arguments. */
  pinFunctionTable?: PinFunctionRecord[];
}

export const BOARD_TOOL_SPECS: LlmToolSpec[] = [
  {
    name: "get_net",
    description: "Return a net record from the head snapshot by exact name.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "get_component",
    description: "Return a component record from the head snapshot by refdes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["refdes"],
      properties: { refdes: { type: "string" } },
    },
  },
  {
    name: "trace_from",
    description:
      "Walk snapshot net membership from a pin for a bounded hop count.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["refdes", "pin", "hops"],
      properties: {
        refdes: { type: "string" },
        pin: { type: "string" },
        hops: { type: "integer" },
      },
    },
  },
  {
    name: "diff_revisions",
    description: "Semantic snapshot diff between two stored revisions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["baseId", "headId"],
      properties: {
        baseId: { type: "string" },
        headId: { type: "string" },
      },
    },
  },
  {
    name: "get_bom_drift",
    description: "BOM blame timeline ending at revisionId.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["revisionId"],
      properties: { revisionId: { type: "string" } },
    },
  },
  {
    name: "run_checks",
    description: "Return stored check runs for a revision. Does not recompute gates.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["revisionId"],
      properties: { revisionId: { type: "string" } },
    },
  },
  {
    name: "get_bsc",
    description: "Generate the Board Support Contract from a stored snapshot.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["revisionId"],
      properties: { revisionId: { type: "string" } },
    },
  },
  {
    name: "get_power_tree",
    description: "Return power and ground nets from the head snapshot.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "get_decoupling",
    description:
      "Return capacitors that share nets with the given refdes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["refdes"],
      properties: { refdes: { type: "string" } },
    },
  },
  {
    name: "get_part_supply",
    description: "Look up part supply data for an MPN when a provider is configured.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["mpn"],
      properties: { mpn: { type: "string" } },
    },
  },
  {
    name: "search_datasheet",
    description: "Search a datasheet store for an MPN when a provider is configured.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["mpn", "query"],
      properties: {
        mpn: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "simulate_change",
    description:
      "Apply structured change operations to a cloned snapshot, rebuild nets, and return an engine verdict. Does not write CAD or create a revision.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["op"],
            properties: {
              op: { type: "string" },
              refdes: { type: "string" },
              value: { type: "string" },
              mpn: { type: "string" },
              pin: { type: "string" },
              net: { type: "string" },
              libId: { type: "string" },
              from: { type: "string" },
              to: { type: "string" },
              connections: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["pin", "net"],
                  properties: {
                    pin: { type: "string" },
                    net: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "generate_firmware_patch",
    description:
      "Deterministic firmware patch from locked vs current BSC. Emits board.h and conservative source migrations. Does not write CAD.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "generate_bringup",
    description:
      "Deterministic bring-up script from the head BSC. Unknown voltages and I2C addresses are withheld.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "generate_review_synthesis",
    description:
      "Engine review rollup of base vs head. electricalGate is copied from the diff; the model cannot set it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "generate_changelog",
    description:
      "Changelog entries copied from the semantic diff, BOM, and BSC. Identifiers only from the engine.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "generate_commit_notes",
    description:
      "Commit subject/body/trailers from the engine diff summary. Does not invent refdes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "audit_substitution",
    description:
      "Substitution candidates from library alternates or same value/footprint MPNs already on the board. Never invents an MPN.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { refdes: { type: "string" } },
    },
  },
  {
    name: "audit_decoupling",
    description:
      "IC power pins whose net has no capacitor. Does not recommend a capacitance.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "audit_test_points",
    description: "Power and ground nets that already have a TP* on them.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "audit_net_names",
    description:
      "Anonymous nets plus pin names already on them. Does not invent net names.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "lookup_pin_functions",
    description:
      "Fill pin functions only from a configured datasheet table. Unverifiable without a table. Ignores functions in tool arguments.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "solve_dc_circuit",
    description:
      "Run the deterministic MNA DC solver on explicit stamps. Returns engine voltages or refutes singular/floating circuits. Extra args cannot invent voltages.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "stamps"],
      properties: {
        nodes: { type: "integer" },
        stamps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "a", "b", "value"],
            properties: {
              kind: { type: "string" },
              a: { type: "integer" },
              b: { type: "integer" },
              value: { type: "number" },
            },
          },
        },
        probes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "node"],
            properties: {
              name: { type: "string" },
              node: { type: "integer" },
              expected: { type: "number" },
            },
          },
        },
      },
    },
  },
  {
    name: "synthesize_topology_block",
    description:
      "Synthesize known topologies (resistor_divider, rc_filter, …) and bind catalog parts. Always Proposed — never writes CAD. Extra args cannot force verified or invent MPNs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["topology", "vin", "vout"],
      properties: {
        topology: { type: "string" },
        vin: { type: "number" },
        vout: { type: "number" },
        iout: { type: "number" },
      },
    },
  },
  {
    name: "find_jlcpcb_candidates",
    description:
      "Query the physics-engine parts catalog (E-series / imported JLCPCB) for candidates. Never invents an MPN.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["type", "value"],
      properties: {
        type: { type: "string" },
        value: { type: "number" },
        package: { type: "string" },
        tolerance: { type: "string" },
        minV: { type: "number" },
        minI: { type: "number" },
        minP: { type: "number" },
        limit: { type: "integer" },
      },
    },
  },
];

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function rejectShadowRevision(revisionId: string): { error: string; revisionId: string } | null {
  if (!isShadowId(revisionId)) return null;
  return { error: "shadow snapshots are not revisions", revisionId };
}

const OPS = new Set([
  "set_component_value",
  "set_component_mpn",
  "connect_pin",
  "disconnect_pin",
  "add_component",
  "remove_component",
  "rename_net",
  "add_test_point",
]);

function parseOperations(
  raw: unknown,
): { ops: ChangeOperation[]; errors: string[] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "simulate_change requires operations[]" };
  }
  const ops: ChangeOperation[] = [];
  const errors: string[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      errors.push("operation is not an object");
      continue;
    }
    const o = row as Record<string, unknown>;
    const op = asString(o.op);
    if (!OPS.has(op)) {
      errors.push(`unknown operation ${op || "(empty)"}`);
      continue;
    }
    if (op === "set_component_value") {
      ops.push({
        op,
        refdes: asString(o.refdes),
        value: asString(o.value),
      });
      continue;
    }
    if (op === "set_component_mpn") {
      ops.push({ op, refdes: asString(o.refdes), mpn: asString(o.mpn) });
      continue;
    }
    if (op === "connect_pin") {
      ops.push({
        op,
        refdes: asString(o.refdes),
        pin: asString(o.pin),
        net: asString(o.net),
      });
      continue;
    }
    if (op === "disconnect_pin") {
      ops.push({ op, refdes: asString(o.refdes), pin: asString(o.pin) });
      continue;
    }
    if (op === "add_component") {
      const connections = Array.isArray(o.connections)
        ? o.connections.map((x) => {
            const c = x as { pin?: unknown; net?: unknown };
            return { pin: asString(c.pin), net: asString(c.net) };
          })
        : [];
      ops.push({
        op,
        refdes: asString(o.refdes),
        libId: asString(o.libId),
        value: asString(o.value),
        connections,
      });
      continue;
    }
    if (op === "remove_component") {
      ops.push({ op, refdes: asString(o.refdes) });
      continue;
    }
    if (op === "rename_net") {
      ops.push({ op, from: asString(o.from), to: asString(o.to) });
      continue;
    }
    ops.push({
      op: "add_test_point",
      net: asString(o.net),
      refdes: asString(o.refdes),
    });
  }
  return { ops, errors };
}

/** Existing snapshot pin/net membership — no new connectivity rules. */
export function get_net(host: ToolHost, name: string) {
  const net = host.head.nets.find((n) => n.name === name);
  return net ?? { error: "net not found", name };
}

export function get_component(host: ToolHost, refdes: string) {
  const c = host.head.components.find((x) => x.refdes === refdes);
  return c ?? { error: "component not found", refdes };
}

export function trace_from(
  host: ToolHost,
  refdes: string,
  pin: string,
  hops: number,
) {
  const startNode = `${refdes}.${pin}`;
  const visitedNets = new Set<string>();
  const frontier: string[] = [];
  const comp = host.head.components.find((c) => c.refdes === refdes);
  const pinNet =
    comp?.pins?.find((p) => p.number === pin)?.net ??
    host.head.nets.find((n) => n.nodes.includes(startNode))?.name;
  if (pinNet) frontier.push(pinNet);

  const hopsUsed = Math.min(hops, 8);
  for (let i = 0; i < hopsUsed; i++) {
    const wave = [...frontier];
    frontier.length = 0;
    for (const netName of wave) {
      if (visitedNets.has(netName)) continue;
      visitedNets.add(netName);
      const net = host.head.nets.find((n) => n.name === netName);
      if (!net) continue;
      for (const node of net.nodes) {
        const rd = node.split(".")[0]!;
        const neighbor = host.head.components.find((c) => c.refdes === rd);
        for (const p of neighbor?.pins ?? []) {
          if (p.net && !visitedNets.has(p.net)) frontier.push(p.net);
        }
      }
    }
  }

  return {
    from: startNode,
    hops: hopsUsed,
    nets: [...visitedNets],
  };
}

export function diff_revisions(host: ToolHost, baseId: string, headId: string) {
  const shadow = rejectShadowRevision(baseId) ?? rejectShadowRevision(headId);
  if (shadow) return { error: shadow.error, baseId, headId };
  const base = host.snapshotFor(baseId);
  const head = host.snapshotFor(headId);
  if (!base || !head) {
    return { error: "snapshot missing", baseId, headId };
  }
  return diffSnapshots(base, head, {
    baseRevisionId: baseId,
    headRevisionId: headId,
  });
}

export function get_bom_drift(host: ToolHost, revisionId: string) {
  const shadow = rejectShadowRevision(revisionId);
  if (shadow) return shadow;
  const revs = host.bomRevisionsFor?.(revisionId);
  if (revs?.length) {
    const map = blameAllBomLines(revs);
    return Object.fromEntries(map);
  }
  const snap = host.snapshotFor(revisionId) ?? host.head;
  return snapshotToBom(snap);
}

export function run_checks(host: ToolHost, revisionId: string) {
  const shadow = rejectShadowRevision(revisionId);
  if (shadow) return shadow;
  return host.checksFor?.(revisionId) ?? [];
}

export function get_bsc(host: ToolHost, revisionId: string) {
  const shadow = rejectShadowRevision(revisionId);
  if (shadow) return shadow;
  const snap = host.snapshotFor(revisionId);
  if (!snap) return { error: "snapshot missing", revisionId };
  return generateBSC(cloneSnapshot(snap), { revisionId });
}

export function get_power_tree(host: ToolHost) {
  const rails = host.head.nets.filter(isPowerRailNet).map((n) => ({
    name: n.name,
    class: n.class ?? null,
    nodes: n.nodes,
  }));
  const bsc = generateBSC(cloneSnapshot(host.head), {
    revisionId: host.headRevisionId ?? null,
  });
  return { rails, bscRails: bsc.powerRails };
}

export function get_decoupling(host: ToolHost, refdes: string) {
  return listDecouplingForRefdes(host.head, refdes);
}

export function audit_substitution(host: ToolHost, refdes?: string) {
  return auditSubstitutions(
    host.head,
    host.bomPlatform ?? [],
    refdes?.trim() ? refdes : undefined,
  );
}

export function audit_decoupling(host: ToolHost) {
  return auditDecoupling(host.head);
}

export function audit_test_points(host: ToolHost) {
  return auditTestPointCoverage(host.head);
}

export function audit_net_names(host: ToolHost) {
  return auditNetNames(host.head);
}

export function lookup_pin_functions(host: ToolHost) {
  const bsc = generateBSC(cloneSnapshot(host.head), {
    revisionId: host.headRevisionId ?? null,
  });
  return lookupPinFunctions(bsc, host.pinFunctionTable);
}

export function get_part_supply(host: ToolHost, mpn: string) {
  if (!host.partSupplyFor) {
    return { error: "parts provider not configured", mpn, status: "unverifiable" };
  }
  return host.partSupplyFor(mpn);
}

export function search_datasheet(host: ToolHost, mpn: string, query: string) {
  if (!host.searchDatasheet) {
    return {
      error: "datasheet store not configured",
      mpn,
      query,
      status: "unverifiable",
    };
  }
  return host.searchDatasheet(mpn, query);
}

export function simulate_change(host: ToolHost, operationsRaw: unknown) {
  const parsed = parseOperations(operationsRaw);
  if ("error" in parsed) {
    return {
      status: "unverifiable" as const,
      error: parsed.error,
      coverage: 0,
      refutations: [parsed.error],
    };
  }
  const { ops, errors } = parsed;
  if (ops.length === 0 && errors.length > 0) {
    return {
      id: null,
      status: "refuted" as const,
      coverage: 0,
      refutations: errors,
      verification: {
        status: "refuted" as const,
        checkDeltas: [],
        bscDelta: null,
        netGraphDelta: { added: [], removed: [], rewired: [] },
        refutations: errors,
        coverage: 0,
      },
    };
  }
  const frozen = JSON.stringify(host.head);
  const beforeBsc = generateBSC(cloneSnapshot(host.head), {
    revisionId: host.headRevisionId ?? null,
  });
  const draft = createShadowSnapshot(host.head, ops, {
    baseRevisionId: host.headRevisionId ?? "head",
    createdBy: "ai",
  });
  const afterBsc = generateBSC(cloneSnapshot(draft.derived), { revisionId: null });
  const bscDelta = diffBSC(beforeBsc, afterBsc);
  if (JSON.stringify(host.head) !== frozen) {
    throw new Error("simulate_change mutated host.head");
  }
  const refutations = [...errors, ...draft.verification.refutations];
  let status = draft.verification.status;
  if (errors.length && status === "verified") status = "verified_with_warnings";
  return {
    id: draft.id,
    baseRevisionId: draft.baseRevisionId,
    createdAt: draft.createdAt,
    expiresAt: draft.expiresAt,
    createdBy: draft.createdBy,
    operations: ops,
    verification: {
      ...draft.verification,
      bscDelta,
      refutations,
      status,
    },
    derivedSummary: {
      componentCount: draft.derived.components.length,
      netCount: draft.derived.nets.length,
    },
  };
}

export function generate_firmware_patch(host: ToolHost) {
  if (!host.firmware) {
    return {
      status: "unverifiable" as const,
      error: "firmware tree not configured",
      coverage: 0,
    };
  }
  return generateFirmwarePatch(host.firmware);
}

function revisionDiff(host: ToolHost) {
  const base = host.base ?? null;
  if (!base) {
    return { error: "base snapshot missing", status: "unverifiable" as const };
  }
  return diffSnapshots(base, host.head, {
    baseRevisionId: host.baseRevisionId ?? "base",
    headRevisionId: host.headRevisionId ?? "head",
  });
}

export function generate_bringup(host: ToolHost) {
  const bsc = generateBSC(cloneSnapshot(host.head), {
    revisionId: host.headRevisionId ?? null,
  });
  return generateBringUpScript(bsc);
}

export function generate_review_synthesis(host: ToolHost) {
  const diff = revisionDiff(host);
  if ("error" in diff) return diff;
  const checks = host.headRevisionId
    ? host.checksFor?.(host.headRevisionId)
    : host.checksFor?.("head");
  return generateReviewSynthesis(diff, { checks: checks ?? [] });
}

export function generate_changelog(host: ToolHost) {
  const diff = revisionDiff(host);
  if ("error" in diff) return diff;
  const base = host.base!;
  const bscChanges = diffBSC(
    generateBSC(cloneSnapshot(base), { revisionId: host.baseRevisionId ?? null }),
    generateBSC(cloneSnapshot(host.head), { revisionId: host.headRevisionId ?? null }),
  );
  return generateChangelog(diff, { bscChanges });
}

export function generate_commit_notes(host: ToolHost) {
  const diff = revisionDiff(host);
  if ("error" in diff) return diff;
  const base = host.base!;
  const bscChanges = diffBSC(
    generateBSC(cloneSnapshot(base), { revisionId: host.baseRevisionId ?? null }),
    generateBSC(cloneSnapshot(host.head), { revisionId: host.headRevisionId ?? null }),
  );
  return generateCommitNotes(diff, { bscChanges });
}

function asNumber(v: unknown, fallback = NaN): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseStamps(raw: unknown): PhysicsStamp[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "stamps must be an array" };
  const out: PhysicsStamp[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const kind = asString(o.kind);
    if (!kind) continue;
    out.push({
      kind: kind as PhysicsStamp["kind"],
      a: asInt(o.a, 0),
      b: asInt(o.b, 0),
      value: asNumber(o.value, 0),
    });
  }
  return out;
}

/** Wrap physics solveDc — ignores class/verified/mpn extras from the model. */
export function solve_dc_circuit(args: Record<string, unknown>) {
  void args.class;
  void args.verified;
  void args.canGateMerge;
  void args.mpn;
  void args.voltage;
  const stamps = parseStamps(args.stamps);
  if ("error" in stamps) {
    return { status: "unverifiable" as const, error: stamps.error, coverage: 0 };
  }
  const probes = Array.isArray(args.probes)
    ? args.probes
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p) => ({
          name: asString(p.name),
          node: asInt(p.node, 0),
          expected:
            p.expected !== undefined ? asNumber(p.expected) : undefined,
        }))
    : undefined;
  const res = solveDc({
    nodes: asInt(args.nodes, 0),
    stamps,
    probes,
  });
  const classified = classifyPhysicsResponse(res, "solve_dc");
  return {
    ...res,
    findingsText: renderPhysicsFindings(res),
    classified,
    electricalGate: undefined,
    canGateMerge: "class" in classified ? classified.canGateMerge : false,
  };
}

export function synthesize_topology_block(args: Record<string, unknown>) {
  void args.class;
  void args.verified;
  void args.mpn;
  void args.bindings;
  const res = synthesizeTopology({
    topology: asString(args.topology),
    vin: asNumber(args.vin),
    vout: asNumber(args.vout),
    iout: args.iout !== undefined ? asNumber(args.iout) : undefined,
  });
  const classified = classifyPhysicsResponse(res, "synthesize");
  return {
    ...res,
    findingsText: renderPhysicsFindings(res),
    classified,
    canGateMerge: false,
    outputClass: "proposed",
  };
}

export function find_jlcpcb_candidates(args: Record<string, unknown>) {
  void args.mpn;
  void args.candidates;
  const res = findPartCandidates({
    type: asString(args.type),
    value: asNumber(args.value),
    package: args.package !== undefined ? asString(args.package) : undefined,
    tolerance:
      args.tolerance !== undefined ? asString(args.tolerance) : undefined,
    minV: args.minV !== undefined ? asNumber(args.minV) : undefined,
    minI: args.minI !== undefined ? asNumber(args.minI) : undefined,
    minP: args.minP !== undefined ? asNumber(args.minP) : undefined,
    limit: args.limit !== undefined ? asInt(args.limit, 5) : undefined,
  });
  return {
    ...res,
    findingsText: renderPhysicsFindings(res),
    classified: classifyPhysicsResponse(res, "find_candidates"),
  };
}

export function executeBoardTool(
  host: ToolHost,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "get_net":
      return get_net(host, asString(args.name));
    case "get_component":
      return get_component(host, asString(args.refdes));
    case "trace_from":
      return trace_from(
        host,
        asString(args.refdes),
        asString(args.pin),
        asInt(args.hops, 1),
      );
    case "diff_revisions":
      return diff_revisions(host, asString(args.baseId), asString(args.headId));
    case "get_bom_drift":
      return get_bom_drift(host, asString(args.revisionId));
    case "run_checks":
      return run_checks(host, asString(args.revisionId));
    case "get_bsc":
      return get_bsc(host, asString(args.revisionId));
    case "get_power_tree":
      return get_power_tree(host);
    case "get_decoupling":
      return get_decoupling(host, asString(args.refdes));
    case "get_part_supply":
      return get_part_supply(host, asString(args.mpn));
    case "search_datasheet":
      return search_datasheet(host, asString(args.mpn), asString(args.query));
    case "simulate_change":
      return simulate_change(host, args.operations);
    case "generate_firmware_patch":
      return generate_firmware_patch(host);
    case "generate_bringup":
      return generate_bringup(host);
    case "generate_review_synthesis":
      return generate_review_synthesis(host);
    case "generate_changelog":
      return generate_changelog(host);
    case "generate_commit_notes":
      return generate_commit_notes(host);
    case "audit_substitution":
      return audit_substitution(
        host,
        args.refdes ? asString(args.refdes) : undefined,
      );
    case "audit_decoupling":
      return audit_decoupling(host);
    case "audit_test_points":
      return audit_test_points(host);
    case "audit_net_names":
      return audit_net_names(host);
    case "lookup_pin_functions":
      return lookup_pin_functions(host);
    case "solve_dc_circuit":
      return solve_dc_circuit(args);
    case "synthesize_topology_block":
      return synthesize_topology_block(args);
    case "find_jlcpcb_candidates":
      return find_jlcpcb_candidates(args);
    default:
      return { error: `unknown tool ${name}` };
  }
}
