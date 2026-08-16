import {
  blameAllBomLines,
  diffSnapshots,
  snapshotToBom,
  type DesignSnapshot,
} from "@solderlab/design-core";
import { generateBSC } from "@solderlab/bsc";
import type { LlmToolSpec } from "./types.ts";

export interface ToolCheckRow {
  name: string;
  status: string;
  summary: string;
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
];

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
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
  const revs = host.bomRevisionsFor?.(revisionId);
  if (revs?.length) {
    const map = blameAllBomLines(revs);
    return Object.fromEntries(map);
  }
  const snap = host.snapshotFor(revisionId) ?? host.head;
  return snapshotToBom(snap);
}

export function run_checks(host: ToolHost, revisionId: string) {
  return host.checksFor?.(revisionId) ?? [];
}

export function get_bsc(host: ToolHost, revisionId: string) {
  const snap = host.snapshotFor(revisionId);
  if (!snap) return { error: "snapshot missing", revisionId };
  return generateBSC(snap, { revisionId });
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
    default:
      return { error: `unknown tool ${name}` };
  }
}
