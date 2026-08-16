import type {
  DesignSnapshot,
  SnapshotComponent,
  SnapshotNet,
} from "./types";

export type Significance = "critical" | "significant" | "cosmetic";

export type ElectricalChangeType =
  | "PinConnectionChanged"
  | "NetMerged"
  | "NetSplit"
  | "NetAdded"
  | "NetRemoved"
  | "NetRenamed"
  | "ComponentAdded"
  | "ComponentRemoved"
  | "ComponentModified";

export interface ElectricalChange {
  type: ElectricalChangeType;
  significance: Significance;
  message: string;
  pin?: string;
  beforeNet?: string;
  afterNet?: string;
  beforeName?: string;
  afterName?: string;
  net?: string;
  beforeNets?: string[];
  afterNets?: string[];
  pinsInvolved?: string[];
  refdes?: string;
  fields?: string[];
}

export interface DiffConfig {
  failOn?: "significant" | "any" | "never";
  jaccardThreshold?: number;
  ignoreChangeTypes?: ElectricalChangeType[];
}

export interface SemanticDiffResult {
  schemaVersion: "1.0";
  changes: ElectricalChange[];
  summary: {
    significantCount: number;
    cosmeticCount: number;
    criticalCount: number;
    gate: "PASS" | "FAIL";
    byType: Partial<Record<ElectricalChangeType, number>>;
  };
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

function pinSetKey(nodes: string[]): string {
  return sortedUnique(nodes).join("|");
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isNamedNet(name: string): boolean {
  return !/^N\$|^Net-\(/i.test(name);
}

function isPowerNet(name: string, cls?: string): boolean {
  if (cls === "power" || cls === "ground") return true;
  return /^(GND|AGND|PGND|VCC|VDD|VSS|VBUS|\+[0-9]|[0-9]+V)/i.test(name);
}

function pinToNetMap(snap: DesignSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of snap.nets) {
    for (const pin of n.nodes) {
      map.set(pin, n.name);
    }
  }
  for (const c of snap.components) {
    for (const p of c.pins ?? []) {
      const id = `${c.refdes}.${p.number}`;
      if (p.net) map.set(id, p.net);
    }
  }
  return map;
}

function allPins(snap: DesignSnapshot): Set<string> {
  const s = new Set<string>();
  for (const n of snap.nets) for (const p of n.nodes) s.add(p);
  for (const c of snap.components) {
    for (const p of c.pins ?? []) s.add(`${c.refdes}.${p.number}`);
  }
  return s;
}

/**
 * NetDiff-style semantic electrical diff (see NetDiff docs/03_DIFF_ALGORITHM.md).
 * Pure, deterministic. Net identity is primarily the pin-set.
 */
export function semanticDiff(
  base: DesignSnapshot,
  head: DesignSnapshot,
  cfg: DiffConfig = {},
): SemanticDiffResult {
  const boardKeys = [
    ...new Set([
      ...base.components.map((c) => c.boardKey ?? ""),
      ...head.components.map((c) => c.boardKey ?? ""),
      ...base.nets.map((n) => n.boardKey ?? ""),
      ...head.nets.map((n) => n.boardKey ?? ""),
    ]),
  ].sort();
  if (boardKeys.length > 1) {
    const changes: ElectricalChange[] = [];
    for (const key of boardKeys) {
      const slice = (snap: DesignSnapshot): DesignSnapshot => ({
        ...snap,
        components: snap.components.filter((c) => (c.boardKey ?? "") === key),
        nets: snap.nets.filter((n) => (n.boardKey ?? "") === key),
      });
      const b = slice(base);
      const h = slice(head);
      if (!b.components.length && !h.components.length && !b.nets.length && !h.nets.length) {
        continue;
      }
      changes.push(...semanticDiffUnscoped(b, h, cfg).changes);
    }
    return summarizeElectrical(changes, cfg);
  }
  return semanticDiffUnscoped(base, head, cfg);
}

function summarizeElectrical(
  changes: ElectricalChange[],
  cfg: DiffConfig,
): SemanticDiffResult {
  const failOn = cfg.failOn ?? "significant";
  const ignore = new Set(cfg.ignoreChangeTypes ?? []);
  const sigRank: Record<Significance, number> = {
    critical: 0,
    significant: 1,
    cosmetic: 2,
  };
  const sorted = [...changes].sort((a, b) => {
    if (sigRank[a.significance] !== sigRank[b.significance]) {
      return sigRank[a.significance] - sigRank[b.significance];
    }
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.message.localeCompare(b.message);
  });
  const byType: Partial<Record<ElectricalChangeType, number>> = {};
  for (const c of sorted) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
  }
  const significantCount = sorted.filter(
    (c) =>
      (c.significance === "significant" || c.significance === "critical") &&
      !ignore.has(c.type),
  ).length;
  const cosmeticCount = sorted.filter((c) => c.significance === "cosmetic").length;
  const criticalCount = sorted.filter((c) => c.significance === "critical").length;
  let gate: "PASS" | "FAIL" = "PASS";
  if (failOn === "any" && sorted.length > 0) gate = "FAIL";
  if (failOn === "significant" && significantCount > 0) gate = "FAIL";
  return {
    schemaVersion: "1.0",
    changes: sorted,
    summary: {
      significantCount,
      cosmeticCount,
      criticalCount,
      gate,
      byType,
    },
  };
}

function semanticDiffUnscoped(
  base: DesignSnapshot,
  head: DesignSnapshot,
  cfg: DiffConfig = {},
): SemanticDiffResult {
  const threshold = cfg.jaccardThreshold ?? 0.6;
  const failOn = cfg.failOn ?? "significant";
  const ignore = new Set(cfg.ignoreChangeTypes ?? []);
  const changes: ElectricalChange[] = [];

  // --- Components ---
  const baseComps = new Map(base.components.map((c) => [c.refdes, c]));
  const headComps = new Map(head.components.map((c) => [c.refdes, c]));
  for (const ref of sortedUnique([...baseComps.keys(), ...headComps.keys()])) {
    const a = baseComps.get(ref);
    const b = headComps.get(ref);
    if (a && !b) {
      changes.push({
        type: "ComponentRemoved",
        significance: "significant",
        message: `${ref} (${a.value}) removed`,
        refdes: ref,
      });
    } else if (!a && b) {
      changes.push({
        type: "ComponentAdded",
        significance: "significant",
        message: `${ref} (${b.value}) added`,
        refdes: ref,
      });
    } else if (a && b) {
      if (a.libId && b.libId && a.libId !== b.libId) {
        changes.push({
          type: "ComponentRemoved",
          significance: "critical",
          message: `${ref} lib_id changed ${a.libId} → ${b.libId} (treated as replace)`,
          refdes: ref,
        });
        changes.push({
          type: "ComponentAdded",
          significance: "critical",
          message: `${ref} replaced with ${b.libId}`,
          refdes: ref,
        });
        continue;
      }
      const fields: string[] = [];
      for (const f of ["value", "footprint", "mpn", "manufacturer"] as const) {
        if (String(a[f] ?? "") !== String(b[f] ?? "")) fields.push(f);
      }
      if (fields.length) {
        changes.push({
          type: "ComponentModified",
          significance: "significant",
          message: `${ref} modified: ${fields.join(", ")}`,
          refdes: ref,
          fields,
        });
      }
    }
  }

  // --- Net matching ---
  const baseNets = base.nets.map((n) => ({
    ...n,
    nodes: sortedUnique(n.nodes),
    key: pinSetKey(n.nodes),
  }));
  const headNets = head.nets.map((n) => ({
    ...n,
    nodes: sortedUnique(n.nodes),
    key: pinSetKey(n.nodes),
  }));

  const unmatchedA = new Set(baseNets.map((_, i) => i));
  const unmatchedB = new Set(headNets.map((_, i) => i));
  /** A-index → B-index */
  const pairAB = new Map<number, number>();

  // Tier 1: exact name
  const headByName = new Map<string, number[]>();
  headNets.forEach((n, i) => {
    const list = headByName.get(n.name) ?? [];
    list.push(i);
    headByName.set(n.name, list);
  });
  for (let i = 0; i < baseNets.length; i++) {
    const candidates = (headByName.get(baseNets[i].name) ?? []).filter((j) =>
      unmatchedB.has(j),
    );
    if (candidates.length === 1) {
      pairAB.set(i, candidates[0]);
      unmatchedA.delete(i);
      unmatchedB.delete(candidates[0]);
    }
  }

  // Tier 2: same pin-set, different name → rename
  const headByKey = new Map<string, number[]>();
  for (const j of unmatchedB) {
    const list = headByKey.get(headNets[j].key) ?? [];
    list.push(j);
    headByKey.set(headNets[j].key, list);
  }
  for (const i of [...unmatchedA]) {
    if (!baseNets[i].key) continue;
    const cands = (headByKey.get(baseNets[i].key) ?? []).filter((j) =>
      unmatchedB.has(j),
    );
    if (cands.length === 1) {
      const j = cands[0];
      pairAB.set(i, j);
      unmatchedA.delete(i);
      unmatchedB.delete(j);
      const named =
        isNamedNet(baseNets[i].name) || isNamedNet(headNets[j].name);
      changes.push({
        type: "NetRenamed",
        significance: named ? "significant" : "cosmetic",
        message: `Net renamed: ${baseNets[i].name} → ${headNets[j].name}`,
        beforeName: baseNets[i].name,
        afterName: headNets[j].name,
        net: headNets[j].name,
      });
    }
  }

  // Tier 3: Jaccard fuzzy
  type Cand = { i: number; j: number; sim: number };
  const fuzzy: Cand[] = [];
  for (const i of unmatchedA) {
    for (const j of unmatchedB) {
      const sim = jaccard(baseNets[i].nodes, headNets[j].nodes);
      if (sim >= threshold) fuzzy.push({ i, j, sim });
    }
  }
  fuzzy.sort((a, b) => {
    if (b.sim !== a.sim) return b.sim - a.sim;
    const an = baseNets[a.i].name.localeCompare(headNets[a.j].name);
    if (an !== 0) return an;
    return baseNets[a.i].key.localeCompare(headNets[a.j].key);
  });
  for (const { i, j } of fuzzy) {
    if (!unmatchedA.has(i) || !unmatchedB.has(j)) continue;
    pairAB.set(i, j);
    unmatchedA.delete(i);
    unmatchedB.delete(j);
  }

  for (const i of unmatchedA) {
    changes.push({
      type: "NetRemoved",
      significance: "significant",
      message: `Net ${baseNets[i].name} removed`,
      net: baseNets[i].name,
      beforeName: baseNets[i].name,
    });
  }
  for (const j of unmatchedB) {
    changes.push({
      type: "NetAdded",
      significance: "significant",
      message: `Net ${headNets[j].name} added`,
      net: headNets[j].name,
      afterName: headNets[j].name,
    });
  }

  // --- Pin connection changes ---
  const pinBase = pinToNetMap(base);
  const pinHead = pinToNetMap(head);
  const renamePairs = new Set(
    changes
      .filter((c) => c.type === "NetRenamed")
      .map((c) => `${c.beforeName}=>${c.afterName}`),
  );
  // Map base net name → matched head net name
  const netNameMap = new Map<string, string>();
  for (const [i, j] of pairAB) {
    netNameMap.set(baseNets[i].name, headNets[j].name);
  }

  const pins = sortedUnique([...allPins(base), ...allPins(head)]).filter(
    (p) => pinBase.has(p) || pinHead.has(p),
  );

  for (const pin of pins) {
    const before = pinBase.get(pin) ?? "unconnected";
    const after = pinHead.get(pin) ?? "unconnected";
    if (before === after) continue;
    if (renamePairs.has(`${before}=>${after}`)) continue;
    const mapped = netNameMap.get(before);
    if (mapped && mapped === after) continue;
    changes.push({
      type: "PinConnectionChanged",
      significance: "significant",
      message: `${pin} moved from ${before} to ${after}`,
      pin,
      beforeNet: before,
      afterNet: after,
    });
  }

  // --- Merge / split from bipartite shared-pin mapping ---
  // Build A-net → set of B-nets via shared pins
  const aToB = new Map<string, Set<string>>();
  const bToA = new Map<string, Set<string>>();
  for (const pin of pins) {
    const an = pinBase.get(pin);
    const bn = pinHead.get(pin);
    if (!an || !bn || an === bn) continue;
    // skip pure renames
    if (renamePairs.has(`${an}=>${bn}`)) continue;
    if (!aToB.has(an)) aToB.set(an, new Set());
    if (!bToA.has(bn)) bToA.set(bn, new Set());
    aToB.get(an)!.add(bn);
    bToA.get(bn)!.add(an);
  }
  for (const [bNet, as] of bToA) {
    if (as.size >= 2) {
      const beforeNets = sortedUnique([...as]);
      const power =
        isPowerNet(bNet) || beforeNets.some((n) => isPowerNet(n));
      changes.push({
        type: "NetMerged",
        significance: power ? "critical" : "significant",
        message: `Nets ${beforeNets.join(" + ")} merged into ${bNet}`,
        beforeNets,
        afterName: bNet,
        net: bNet,
      });
    }
  }
  for (const [aNet, bs] of aToB) {
    if (bs.size >= 2) {
      const afterNets = sortedUnique([...bs]);
      changes.push({
        type: "NetSplit",
        significance: "significant",
        message: `Net ${aNet} split into ${afterNets.join(", ")}`,
        beforeName: aNet,
        afterNets,
        net: aNet,
      });
    }
  }

  // Sort deterministic
  const sigRank: Record<Significance, number> = {
    critical: 0,
    significant: 1,
    cosmetic: 2,
  };
  changes.sort((a, b) => {
    if (sigRank[a.significance] !== sigRank[b.significance]) {
      return sigRank[a.significance] - sigRank[b.significance];
    }
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.message.localeCompare(b.message);
  });

  const byType: Partial<Record<ElectricalChangeType, number>> = {};
  for (const c of changes) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
  }

  const significantCount = changes.filter(
    (c) =>
      (c.significance === "significant" || c.significance === "critical") &&
      !ignore.has(c.type),
  ).length;
  const cosmeticCount = changes.filter(
    (c) => c.significance === "cosmetic",
  ).length;
  const criticalCount = changes.filter(
    (c) => c.significance === "critical",
  ).length;

  let gate: "PASS" | "FAIL" = "PASS";
  if (failOn === "any" && changes.length > 0) gate = "FAIL";
  if (failOn === "significant" && significantCount > 0) gate = "FAIL";

  return {
    schemaVersion: "1.0",
    changes,
    summary: {
      significantCount,
      cosmeticCount,
      criticalCount,
      gate,
      byType,
    },
  };
}

/** Re-export helpers used when enriching snapshots */
export function annotateSnapshotNets(snap: DesignSnapshot): DesignSnapshot {
  return {
    ...snap,
    nets: snap.nets.map((n) => ({
      ...n,
      isNamed: isNamedNet(n.name),
      isPower: isPowerNet(n.name, n.class),
      nodes: sortedUnique(n.nodes),
    })),
  };
}

export type { SnapshotComponent, SnapshotNet };
