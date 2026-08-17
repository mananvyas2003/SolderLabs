/**
 * Shadow snapshots — apply structured change operations to a cloned
 * DesignSnapshot, then re-derive nets from pin membership.
 *
 * Never writes .kicad_sch. A shadow is never a revision.
 */

import { semanticDiff } from "./semantic-diff";
import type { DesignSnapshot, SnapshotComponent, SnapshotNet, SnapshotPin } from "./types";

export type ChangeOperation =
  | { op: "set_component_value"; refdes: string; value: string }
  | { op: "set_component_mpn"; refdes: string; mpn: string }
  | { op: "connect_pin"; refdes: string; pin: string; net: string }
  | { op: "disconnect_pin"; refdes: string; pin: string }
  | { op: "add_component"; refdes: string; libId: string; value: string;
      connections: { pin: string; net: string }[] }
  | { op: "remove_component"; refdes: string }
  | { op: "rename_net"; from: string; to: string }
  | { op: "add_test_point"; net: string; refdes: string };

export type VerificationStatus =
  | "verified"
  | "verified_with_warnings"
  | "refuted"
  | "unverifiable";

export interface VerificationResult {
  status: VerificationStatus;
  checkDeltas: Array<{
    name: string;
    before: string;
    after: string;
  }>;
  bscDelta: unknown | null;
  netGraphDelta: { added: string[]; removed: string[]; rewired: string[] };
  refutations: string[];
  /** 0–1: share of operations the engine could apply and check. */
  coverage: number;
}

export interface ShadowSnapshot {
  id: string;
  baseRevisionId: string;
  operations: ChangeOperation[];
  derived: DesignSnapshot;
  verification: VerificationResult;
  createdAt: string;
  createdBy: "ai" | "user";
  expiresAt: string;
}

export function cloneSnapshot(src: DesignSnapshot): DesignSnapshot {
  return {
    ...src,
    sheets: src.sheets.map((s) => ({ ...s })),
    components: src.components.map((c) => ({
      ...c,
      pins: c.pins?.map((p) => ({ ...p })),
    })),
    nets: src.nets.map((n) => ({ ...n, nodes: [...n.nodes] })),
    boards: src.boards?.map((b) => ({ ...b })),
    warnings: src.warnings?.map((w) => ({ ...w })),
    mcuDetection: src.mcuDetection
      ? {
          threshold: src.mcuDetection.threshold,
          candidates: src.mcuDetection.candidates.map((x) => ({
            ...x,
            parts: { ...x.parts },
          })),
        }
      : undefined,
  };
}

function findComp(
  snap: DesignSnapshot,
  refdes: string,
): SnapshotComponent | undefined {
  return snap.components.find((c) => c.refdes === refdes);
}

function findPin(
  snap: DesignSnapshot,
  refdes: string,
  number: string,
): { component: SnapshotComponent; pin: SnapshotPin } | null {
  for (const c of snap.components) {
    if (c.refdes !== refdes) continue;
    const pin = c.pins?.find((p) => p.number === number);
    if (pin) return { component: c, pin };
  }
  return null;
}

export function isShadowId(id: string): boolean {
  return id.startsWith("shadow-");
}

/**
 * Rebuild nets from pin.net fields. This is the snapshot-level analogue of
 * re-running the connectivity resolver: membership is derived, not patched.
 */
export function rebuildNetsFromPins(snap: DesignSnapshot): SnapshotNet[] {
  const prev = new Map(snap.nets.map((n) => [n.name, n]));
  const nodes = new Map<string, Set<string>>();
  for (const c of snap.components) {
    for (const p of c.pins ?? []) {
      const name = (p.net ?? "").trim();
      if (!name) continue;
      let set = nodes.get(name);
      if (!set) {
        set = new Set();
        nodes.set(name, set);
      }
      set.add(`${c.refdes}.${p.number}`);
    }
  }
  const out: SnapshotNet[] = [];
  for (const [name, set] of nodes) {
    const old = prev.get(name);
    out.push({
      name,
      displayName: old?.displayName,
      class: old?.class,
      nodes: [...set].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      isNamed: old?.isNamed ?? !/^N\$|^Net-\(/i.test(name),
      isPower: old?.isPower,
      boardKey: old?.boardKey,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function applyOne(
  snap: DesignSnapshot,
  op: ChangeOperation,
): string | null {
  switch (op.op) {
    case "set_component_value": {
      const c = findComp(snap, op.refdes);
      if (!c) return `set_component_value: ${op.refdes} not in snapshot`;
      c.value = op.value;
      return null;
    }
    case "set_component_mpn": {
      const c = findComp(snap, op.refdes);
      if (!c) return `set_component_mpn: ${op.refdes} not in snapshot`;
      c.mpn = op.mpn;
      return null;
    }
    case "connect_pin": {
      const hit = findPin(snap, op.refdes, op.pin);
      if (!hit) {
        return `connect_pin: ${op.refdes}.${op.pin} not in snapshot`;
      }
      hit.pin.net = op.net;
      return null;
    }
    case "disconnect_pin": {
      const hit = findPin(snap, op.refdes, op.pin);
      if (!hit) {
        return `disconnect_pin: ${op.refdes}.${op.pin} not in snapshot`;
      }
      hit.pin.net = "";
      return null;
    }
    case "add_component": {
      if (findComp(snap, op.refdes)) {
        return `add_component: ${op.refdes} already exists`;
      }
      const pins: SnapshotPin[] = op.connections.map((x) => ({
        number: x.pin,
        name: x.pin,
        net: x.net,
      }));
      snap.components.push({
        refdes: op.refdes,
        value: op.value,
        footprint: "",
        libId: op.libId,
        sheetId: snap.sheets[0]?.id ?? "root",
        pins,
      });
      return null;
    }
    case "remove_component": {
      const i = snap.components.findIndex((c) => c.refdes === op.refdes);
      if (i < 0) return `remove_component: ${op.refdes} not in snapshot`;
      snap.components.splice(i, 1);
      return null;
    }
    case "rename_net": {
      let hits = 0;
      for (const c of snap.components) {
        for (const p of c.pins ?? []) {
          if (p.net === op.from) {
            p.net = op.to;
            hits += 1;
          }
        }
      }
      if (!hits) return `rename_net: ${op.from} has no pin members`;
      return null;
    }
    case "add_test_point": {
      if (findComp(snap, op.refdes)) {
        return `add_test_point: ${op.refdes} already exists`;
      }
      snap.components.push({
        refdes: op.refdes,
        value: "TestPoint",
        footprint: "",
        libId: "Connector_Testpoint:TestPoint",
        sheetId: snap.sheets[0]?.id ?? "root",
        pins: [{ number: "1", name: "1", net: op.net }],
      });
      return null;
    }
    default: {
      const _never: never = op;
      return `unknown operation ${JSON.stringify(_never)}`;
    }
  }
}

export function applyChangeOperations(
  base: DesignSnapshot,
  operations: ChangeOperation[],
): { derived: DesignSnapshot; refutations: string[]; applied: number } {
  const derived = cloneSnapshot(base);
  const refutations: string[] = [];
  let applied = 0;
  for (const op of operations) {
    const err = applyOne(derived, op);
    if (err) refutations.push(err);
    else applied += 1;
  }
  derived.nets = rebuildNetsFromPins(derived);
  derived.meta = {
    ...derived.meta,
    componentCount: derived.components.length,
    netCount: derived.nets.length,
  };
  return { derived, refutations, applied };
}

function nodeKey(nodes: string[]): string {
  return [...nodes].sort().join("\0");
}

function netGraphDelta(
  base: DesignSnapshot,
  derived: DesignSnapshot,
): VerificationResult["netGraphDelta"] {
  const before = new Map(base.nets.map((n) => [n.name, nodeKey(n.nodes)]));
  const after = new Map(derived.nets.map((n) => [n.name, nodeKey(n.nodes)]));
  const added: string[] = [];
  const removed: string[] = [];
  const rewired: string[] = [];
  for (const [name, nodes] of after) {
    const prev = before.get(name);
    if (prev == null) added.push(name);
    else if (prev !== nodes) rewired.push(name);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) removed.push(name);
  }
  return { added, removed, rewired };
}

function opsTouchNets(ops: ChangeOperation[]): boolean {
  return ops.some(
    (o) =>
      o.op === "connect_pin" ||
      o.op === "disconnect_pin" ||
      o.op === "rename_net" ||
      o.op === "add_component" ||
      o.op === "remove_component" ||
      o.op === "add_test_point",
  );
}

export function verifyShadow(
  base: DesignSnapshot,
  derived: DesignSnapshot,
  ops: ChangeOperation[],
  applied: number,
  refutations: string[],
  bscDelta: unknown | null = null,
): VerificationResult {
  const electrical = semanticDiff(base, derived);
  const afterGate = electrical.summary.gate;
  const checkDeltas = [
    {
      name: "electricalGate",
      before: "n/a",
      after: afterGate,
    },
    {
      name: "significantElectrical",
      before: "0",
      after: String(electrical.summary.significantCount),
    },
  ];

  const pinRecords = base.components.some((c) => (c.pins?.length ?? 0) > 0);
  let coverage = ops.length === 0 ? 1 : applied / ops.length;
  if (opsTouchNets(ops)) coverage = Math.min(coverage, 0.85);

  let status: VerificationStatus;
  if (opsTouchNets(ops) && !pinRecords) status = "unverifiable";
  else if (ops.length > 0 && applied === 0) status = "refuted";
  else if (refutations.length && applied > 0) status = "verified_with_warnings";
  else if (applied > 0 && afterGate === "FAIL" && opsTouchNets(ops)) {
    status = "verified_with_warnings";
  } else status = "verified";

  return {
    status,
    checkDeltas,
    bscDelta,
    netGraphDelta: netGraphDelta(base, derived),
    refutations,
    coverage: Math.round(coverage * 1000) / 1000,
  };
}

export function createShadowSnapshot(
  base: DesignSnapshot,
  operations: ChangeOperation[],
  opts?: {
    baseRevisionId?: string;
    createdBy?: "ai" | "user";
    bscDelta?: unknown | null;
    now?: Date;
  },
): ShadowSnapshot {
  const now = opts?.now ?? new Date();
  const { derived, refutations, applied } = applyChangeOperations(base, operations);
  const verification = verifyShadow(
    base,
    derived,
    operations,
    applied,
    refutations,
    opts?.bscDelta ?? null,
  );
  const id = `shadow-${now.getTime().toString(36)}-${applied.toString(36)}`;
  const expires = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    id,
    baseRevisionId: opts?.baseRevisionId ?? "head",
    operations,
    derived,
    verification,
    createdAt: now.toISOString(),
    createdBy: opts?.createdBy ?? "ai",
    expiresAt: expires.toISOString(),
  };
}
