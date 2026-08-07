/**
 * Impact engine — propagate design changes outward from a DiffBundle.
 * Steps 1–5 are deterministic and never call an LLM.
 * Step 6 (electrical envelope reasoning) may use an LLM, but every claim
 * must cite a component / net / BOM line that appears in the deterministic result.
 */

import type {
  BomDiffRow,
  BomLineLike,
  DesignSnapshot,
  NetDiff,
  SnapshotComponent,
  SnapshotNet,
} from "./types";
import type { SemanticDiffResult } from "./semantic-diff";

/** Local shape — avoids circular import with index.ts DiffBundleData */
export interface ImpactDiffBundle {
  baseRevisionId: string;
  headRevisionId: string;
  components: Array<{
    refdes: string;
    kind: string;
    before?: SnapshotComponent;
    after?: SnapshotComponent;
    fields?: string[];
  }>;
  bom: BomDiffRow[];
  nets: NetDiff[];
  electrical?: SemanticDiffResult;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImpactCitationKind =
  | "component"
  | "net"
  | "bom_line"
  | "bsc_change"
  | "transmittal"
  | "test";

export interface ImpactCitation {
  kind: ImpactCitationKind;
  ref: string;
}

export interface TouchedNetImpact {
  net: string;
  changeKind: NetDiff["kind"] | "electrical" | "component_touch";
  /** Components on this net in the (head) snapshot graph */
  connectedRefdes: string[];
}

export interface ConnectedComponentImpact {
  refdes: string;
  reason: "changed" | "on_touched_net" | "added" | "removed";
  nets: string[];
  mpn?: string;
  value?: string;
}

export interface BscSurfaceImpact {
  kind: string;
  severity: string;
  message: string;
  citations: ImpactCitation[];
}

export interface BomImpactLine {
  refdes: string;
  kind: BomDiffRow["kind"];
  beforeMpn?: string;
  afterMpn?: string;
  unitCostDeltaUsd: number | null;
  leadTimeDeltaDays: number | null;
  introducesSingleSource: boolean;
  citations: ImpactCitation[];
}

export interface BomImpactSummary {
  lines: BomImpactLine[];
  costDeltaUsd: number | null;
  leadTimeDeltaDays: number | null;
  singleSourceIntroduced: string[];
}

export interface InFlightImpact {
  supplierId: string;
  supplierName: string;
  heldRevisionId: string;
  superseded: boolean;
  citations: ImpactCitation[];
}

export interface TestInvalidation {
  testId: string;
  testName: string;
  reason: string;
  citations: ImpactCitation[];
}

export interface ImpactClaim {
  text: string;
  citations: ImpactCitation[];
  /** false → render as "unverified", never mixed with grounded findings */
  grounded: boolean;
}

export interface EcoDraft {
  title: string;
  rationale: string;
  affectedItems: string[];
  requiredApprovals: string[];
  suggestedVerification: string[];
}

export interface DeterministicImpact {
  touchedNets: TouchedNetImpact[];
  connectedComponents: ConnectedComponentImpact[];
  bscSurface: BscSurfaceImpact[];
  bom: BomImpactSummary;
  inFlight: InFlightImpact[];
  invalidatedTests: TestInvalidation[];
}

export interface ImpactReport extends DeterministicImpact {
  electricalClaims: ImpactClaim[];
  unverifiedClaims: ImpactClaim[];
  /** Claims dropped for missing / invalid citations */
  droppedClaims: string[];
  eco: EcoDraft;
}

/** Minimal BSC change row — avoids depending on @solderlab/bsc from design-core. */
export interface ImpactBscChange {
  kind: string;
  severity: string;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface PartPricing {
  unitCostUsd?: number;
  leadTimeDays?: number;
  /** Distinct supplier names / ids for this MPN */
  suppliers?: string[];
}

export interface OpenTransmittal {
  supplierId: string;
  supplierName: string;
  /** Revision the supplier currently holds */
  revisionId: string;
  boardRevision?: string;
}

export interface PriorTestEvidence {
  id: string;
  name: string;
  revisionId: string;
  status: string;
  /** Nets exercised by this test */
  nets?: string[];
  /** Components exercised by this test */
  components?: string[];
}

export interface ImpactContext {
  /** Prefer head snapshot — connectivity from parsed graph, not the LLM */
  snapshot: DesignSnapshot;
  bscChanges?: ImpactBscChange[];
  /** Previously released / baseline BOM (optional) */
  releasedBom?: BomLineLike[];
  /** MPN → pricing / supplier inventory */
  pricingByMpn?: Record<string, PartPricing>;
  openTransmittals?: OpenTransmittal[];
  testEvidence?: PriorTestEvidence[];
  /** Revision currently in the field / released */
  releasedRevisionId?: string;
  headRevisionId?: string;
  baseRevisionId?: string;
}

export interface RawLlmClaim {
  text: string;
  citations: ImpactCitation[];
}

export type ImpactLlmFn = (
  ground: DeterministicImpact,
  diff: ImpactDiffBundle,
) => Promise<RawLlmClaim[]> | RawLlmClaim[];

// ---------------------------------------------------------------------------
// Graph helpers (step 1)
// ---------------------------------------------------------------------------

function buildNetIndex(snapshot: DesignSnapshot): {
  netsByName: Map<string, SnapshotNet>;
  netsByRefdes: Map<string, Set<string>>;
  compsByRefdes: Map<string, SnapshotComponent>;
} {
  const netsByName = new Map<string, SnapshotNet>();
  const netsByRefdes = new Map<string, Set<string>>();
  const compsByRefdes = new Map(
    snapshot.components.map((c) => [c.refdes, c] as const),
  );

  for (const net of snapshot.nets) {
    netsByName.set(net.name, net);
    for (const node of net.nodes) {
      const refdes = node.split(".")[0]!;
      let set = netsByRefdes.get(refdes);
      if (!set) {
        set = new Set();
        netsByRefdes.set(refdes, set);
      }
      set.add(net.name);
    }
    // Also walk pin-level connectivity when nodes list is empty but pins carry nets
  }

  for (const c of snapshot.components) {
    for (const pin of c.pins ?? []) {
      if (!pin.net) continue;
      let set = netsByRefdes.get(c.refdes);
      if (!set) {
        set = new Set();
        netsByRefdes.set(c.refdes, set);
      }
      set.add(pin.net);
      if (!netsByName.has(pin.net)) {
        netsByName.set(pin.net, {
          name: pin.net,
          nodes: [`${c.refdes}.${pin.number}`],
        });
      }
    }
  }

  return { netsByName, netsByRefdes, compsByRefdes };
}

function refdesOnNet(net: SnapshotNet | undefined): string[] {
  if (!net) return [];
  const refs = new Set<string>();
  for (const node of net.nodes) {
    refs.add(node.split(".")[0]!);
  }
  return [...refs].sort();
}

/** Collect nets touched by the DiffBundle (named net diff + electrical + component pin nets). */
export function collectTouchedNets(
  diff: ImpactDiffBundle,
  snapshot: DesignSnapshot,
): TouchedNetImpact[] {
  const { netsByName, netsByRefdes } = buildNetIndex(snapshot);
  const out = new Map<string, TouchedNetImpact>();

  const bump = (
    name: string,
    changeKind: TouchedNetImpact["changeKind"],
  ) => {
    if (!name) return;
    const existing = out.get(name);
    const connected = refdesOnNet(netsByName.get(name));
    if (existing) {
      if (existing.changeKind === "component_touch") {
        existing.changeKind = changeKind;
      }
      return;
    }
    out.set(name, { net: name, changeKind, connectedRefdes: connected });
  };

  for (const n of diff.nets ?? []) {
    if (n.kind === "unchanged") continue;
    bump(n.name, n.kind);
    if (n.beforeName && n.beforeName !== n.name) bump(n.beforeName, n.kind);
  }

  for (const ch of diff.electrical?.changes ?? []) {
    if (ch.net) bump(ch.net, "electrical");
    if (ch.refdes) {
      for (const netName of netsByRefdes.get(ch.refdes) ?? []) {
        bump(netName, "electrical");
      }
    }
  }

  for (const c of diff.components ?? []) {
    if (c.kind === "unchanged") continue;
    const ref = c.after?.refdes ?? c.before?.refdes ?? c.refdes;
    for (const netName of netsByRefdes.get(ref) ?? []) {
      bump(netName, "component_touch");
    }
  }

  return [...out.values()].sort((a, b) => a.net.localeCompare(b.net));
}

export function collectConnectedComponents(
  diff: ImpactDiffBundle,
  snapshot: DesignSnapshot,
  touchedNets: TouchedNetImpact[],
): ConnectedComponentImpact[] {
  const { netsByRefdes, compsByRefdes } = buildNetIndex(snapshot);
  const byRef = new Map<string, ConnectedComponentImpact>();

  const upsert = (
    refdes: string,
    reason: ConnectedComponentImpact["reason"],
  ) => {
    const comp = compsByRefdes.get(refdes);
    const nets = [...(netsByRefdes.get(refdes) ?? [])].sort();
    const prev = byRef.get(refdes);
    if (prev) {
      // Prefer explicit change reasons over transitive on_touched_net
      if (prev.reason === "on_touched_net" && reason !== "on_touched_net") {
        prev.reason = reason;
      }
      return;
    }
    byRef.set(refdes, {
      refdes,
      reason,
      nets,
      mpn: comp?.mpn,
      value: comp?.value,
    });
  };

  for (const c of diff.components ?? []) {
    if (c.kind === "unchanged") continue;
    const reason: ConnectedComponentImpact["reason"] =
      c.kind === "added"
        ? "added"
        : c.kind === "removed"
          ? "removed"
          : "changed";
    upsert(c.refdes, reason);
    if (c.before?.refdes && c.before.refdes !== c.refdes) {
      upsert(c.before.refdes, reason);
    }
  }

  for (const tn of touchedNets) {
    for (const ref of tn.connectedRefdes) {
      upsert(ref, "on_touched_net");
    }
  }

  return [...byRef.values()].sort((a, b) => a.refdes.localeCompare(b.refdes));
}

// ---------------------------------------------------------------------------
// Step 2 — BSC surface
// ---------------------------------------------------------------------------

export function mapBscSurfaceImpact(
  bscChanges: ImpactBscChange[] | undefined,
): BscSurfaceImpact[] {
  if (!bscChanges?.length) return [];
  return bscChanges.map((c) => ({
    kind: c.kind,
    severity: c.severity,
    message: c.message,
    citations: [{ kind: "bsc_change" as const, ref: `${c.kind}:${c.message}` }],
  }));
}

// ---------------------------------------------------------------------------
// Step 3 — BOM
// ---------------------------------------------------------------------------

function mpnKey(mpn?: string): string | undefined {
  const t = mpn?.trim();
  return t ? t.toUpperCase() : undefined;
}

export function analyzeBomImpact(
  bomDiff: BomDiffRow[],
  pricingByMpn: Record<string, PartPricing> = {},
): BomImpactSummary {
  const lines: BomImpactLine[] = [];
  let costSum = 0;
  let costKnown = false;
  let leadSum = 0;
  let leadKnown = false;
  const singleSourceIntroduced: string[] = [];

  for (const row of bomDiff) {
    if (row.kind === "unchanged") continue;
    const beforeMpn = row.before?.mpn;
    const afterMpn = row.after?.mpn;
    const beforeP = beforeMpn
      ? pricingByMpn[mpnKey(beforeMpn)!] ?? pricingByMpn[beforeMpn]
      : undefined;
    const afterP = afterMpn
      ? pricingByMpn[mpnKey(afterMpn)!] ?? pricingByMpn[afterMpn]
      : undefined;

    let unitCostDeltaUsd: number | null = null;
    if (
      afterP?.unitCostUsd != null ||
      beforeP?.unitCostUsd != null ||
      row.kind === "added" ||
      row.kind === "removed"
    ) {
      const a = afterP?.unitCostUsd ?? (row.kind === "removed" ? 0 : null);
      const b = beforeP?.unitCostUsd ?? (row.kind === "added" ? 0 : null);
      if (a != null && b != null) {
        unitCostDeltaUsd = a - b;
        costSum += unitCostDeltaUsd;
        costKnown = true;
      }
    }

    let leadTimeDeltaDays: number | null = null;
    if (afterP?.leadTimeDays != null || beforeP?.leadTimeDays != null) {
      const a =
        afterP?.leadTimeDays ?? (row.kind === "removed" ? 0 : null);
      const b =
        beforeP?.leadTimeDays ?? (row.kind === "added" ? 0 : null);
      if (a != null && b != null) {
        leadTimeDeltaDays = a - b;
        leadSum += leadTimeDeltaDays;
        leadKnown = true;
      }
    }

    const suppliers = afterP?.suppliers ?? [];
    const introducesSingleSource =
      Boolean(afterMpn) &&
      (row.kind === "added" ||
        (row.kind === "changed" &&
          mpnKey(beforeMpn) !== mpnKey(afterMpn))) &&
      suppliers.length === 1;

    if (introducesSingleSource && afterMpn) {
      singleSourceIntroduced.push(afterMpn);
    }

    lines.push({
      refdes: row.refdes,
      kind: row.kind,
      beforeMpn,
      afterMpn,
      unitCostDeltaUsd,
      leadTimeDeltaDays,
      introducesSingleSource,
      citations: [{ kind: "bom_line", ref: row.refdes }],
    });
  }

  return {
    lines,
    costDeltaUsd: costKnown ? costSum : null,
    leadTimeDeltaDays: leadKnown ? leadSum : null,
    singleSourceIntroduced: [...new Set(singleSourceIntroduced)],
  };
}

// ---------------------------------------------------------------------------
// Step 4 — in-flight supplier transmittals
// ---------------------------------------------------------------------------

export function analyzeInFlightTransmittals(
  openTransmittals: OpenTransmittal[] | undefined,
  releasedRevisionId: string | undefined,
  headRevisionId: string | undefined,
): InFlightImpact[] {
  if (!openTransmittals?.length) return [];
  return openTransmittals.map((t) => {
    const superseded =
      Boolean(headRevisionId) &&
      t.revisionId !== headRevisionId &&
      (releasedRevisionId
        ? t.revisionId === releasedRevisionId ||
          t.revisionId !== headRevisionId
        : t.revisionId !== headRevisionId);
    return {
      supplierId: t.supplierId,
      supplierName: t.supplierName,
      heldRevisionId: t.revisionId,
      superseded,
      citations: [
        {
          kind: "transmittal" as const,
          ref: `${t.supplierId}@${t.revisionId}`,
        },
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Step 5 — test evidence invalidation
// ---------------------------------------------------------------------------

export function analyzeTestInvalidation(
  tests: PriorTestEvidence[] | undefined,
  touchedNets: TouchedNetImpact[],
  connectedComponents: ConnectedComponentImpact[],
): TestInvalidation[] {
  if (!tests?.length) return [];
  const netSet = new Set(touchedNets.map((n) => n.net));
  const compSet = new Set(connectedComponents.map((c) => c.refdes));
  const out: TestInvalidation[] = [];

  for (const t of tests) {
    const hitNets = (t.nets ?? []).filter((n) => netSet.has(n));
    const hitComps = (t.components ?? []).filter((c) => compSet.has(c));
    if (!hitNets.length && !hitComps.length) continue;
    const bits: string[] = [];
    if (hitNets.length) bits.push(`nets ${hitNets.join(", ")}`);
    if (hitComps.length) bits.push(`components ${hitComps.join(", ")}`);
    out.push({
      testId: t.id,
      testName: t.name,
      reason: `Prior result on ${t.revisionId} overlaps changed ${bits.join(" and ")}`,
      citations: [
        { kind: "test", ref: t.id },
        ...hitNets.map((n) => ({ kind: "net" as const, ref: n })),
        ...hitComps.map((c) => ({ kind: "component" as const, ref: c })),
      ],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Citation universe + LLM gate (step 6)
// ---------------------------------------------------------------------------

export function buildCitationUniverse(
  ground: DeterministicImpact,
): Set<string> {
  const keys = new Set<string>();
  const add = (kind: ImpactCitationKind, ref: string) => {
    keys.add(`${kind}:${ref}`);
  };
  for (const n of ground.touchedNets) add("net", n.net);
  for (const c of ground.connectedComponents) add("component", c.refdes);
  for (const b of ground.bom.lines) add("bom_line", b.refdes);
  for (const s of ground.bscSurface) {
    for (const cit of s.citations) add(cit.kind, cit.ref);
  }
  for (const t of ground.inFlight) {
    for (const cit of t.citations) add(cit.kind, cit.ref);
  }
  for (const t of ground.invalidatedTests) {
    for (const cit of t.citations) add(cit.kind, cit.ref);
  }
  return keys;
}

function citationKey(c: ImpactCitation): string {
  return `${c.kind}:${c.ref}`;
}

/**
 * Every LLM claim must cite a specific component, net, or BOM line
 * from the deterministic result. Drop claims that cannot cite.
 */
export function gateImpactClaims(
  raw: RawLlmClaim[],
  ground: DeterministicImpact,
): {
  grounded: ImpactClaim[];
  unverified: ImpactClaim[];
  dropped: string[];
} {
  const universe = buildCitationUniverse(ground);
  const grounded: ImpactClaim[] = [];
  const unverified: ImpactClaim[] = [];
  const dropped: string[] = [];

  for (const claim of raw) {
    const text = claim.text?.trim();
    if (!text) {
      dropped.push("(empty claim)");
      continue;
    }
    const citations = (claim.citations ?? []).filter(
      (c) => c?.kind && c?.ref,
    );
    if (!citations.length) {
      dropped.push(text);
      continue;
    }
    const allValid = citations.every((c) => universe.has(citationKey(c)));
    if (allValid) {
      grounded.push({ text, citations, grounded: true });
    } else {
      // Partial / unknown citations → unverified, never mixed with grounded
      unverified.push({ text, citations, grounded: false });
    }
  }

  return { grounded, unverified, dropped };
}

/**
 * Deterministic electrical hints (no LLM) — only emits claims with solid citations.
 */
export function localElectricalReasoning(
  diff: ImpactDiffBundle,
  ground: DeterministicImpact,
  snapshot: DesignSnapshot,
): ImpactClaim[] {
  const claims: ImpactClaim[] = [];
  const comps = new Map(snapshot.components.map((c) => [c.refdes, c]));

  for (const row of diff.components ?? []) {
    if (row.kind !== "changed" || !row.fields?.includes("value")) continue;
    const ref = row.refdes;
    const before = row.before?.value;
    const after = row.after?.value;
    if (!before || !after || before === after) continue;

    const connected = ground.connectedComponents.find((c) => c.refdes === ref);
    const nets = connected?.nets ?? [];
    const neighbors = new Set<string>();
    for (const netName of nets) {
      const tn = ground.touchedNets.find((n) => n.net === netName);
      for (const r of tn?.connectedRefdes ?? []) {
        if (r !== ref) neighbors.add(r);
      }
    }

    const regulatorNeighbor = [...neighbors].find((r) => {
      const c = comps.get(r);
      if (!c) return false;
      const blob = `${c.libId ?? ""} ${c.value} ${c.mpn ?? ""}`.toLowerCase();
      return /ldo|regulat|ap21|ams1117|ldo|tlv|ncp|mic/.test(blob);
    });

    if (regulatorNeighbor) {
      const net = nets[0];
      const citations: ImpactCitation[] = [
        { kind: "component", ref },
        { kind: "component", ref: regulatorNeighbor },
      ];
      if (net) citations.push({ kind: "net", ref: net });
      claims.push({
        text: `Value change on ${ref} (${before} → ${after}) shares net connectivity with ${regulatorNeighbor}; verify the regulator / load still within its supply envelope.`,
        citations,
        grounded: true,
      });
    }
  }

  // BSC breaking changes already have deterministic messages — surface as claims
  for (const b of ground.bscSurface.filter((x) => x.severity === "breaking")) {
    claims.push({
      text: `BSC breaking change: ${b.message}`,
      citations: b.citations,
      grounded: true,
    });
  }

  return claims;
}

// ---------------------------------------------------------------------------
// ECO draft
// ---------------------------------------------------------------------------

export function draftEco(
  ground: DeterministicImpact,
  electrical: ImpactClaim[],
): EcoDraft {
  const affected = [
    ...ground.connectedComponents.map((c) => c.refdes),
    ...ground.bom.lines.map((b) => `BOM:${b.refdes}`),
    ...ground.bscSurface.map((b) => `BSC:${b.kind}`),
  ];
  const uniqueAffected = [...new Set(affected)].slice(0, 40);

  const approvals: string[] = ["Hardware owner"];
  if (ground.bscSurface.some((b) => b.severity === "breaking")) {
    approvals.push("Firmware owner");
  }
  if (ground.bom.lines.length) approvals.push("Supply chain / buyer");
  if (ground.inFlight.some((t) => t.superseded)) {
    approvals.push("Supplier quality / NPI");
  }
  if (ground.invalidatedTests.length) approvals.push("Test / validation");

  const verification: string[] = [];
  if (ground.touchedNets.length) {
    verification.push(
      `Re-run continuity / ERC on nets: ${ground.touchedNets
        .slice(0, 8)
        .map((n) => n.net)
        .join(", ")}`,
    );
  }
  if (ground.bscSurface.some((b) => b.severity === "breaking")) {
    verification.push("Pull new BSC and run `solderlab bsc check --scan` in firmware CI");
  }
  if (ground.invalidatedTests.length) {
    verification.push(
      `Repeat invalidated tests: ${ground.invalidatedTests
        .map((t) => t.testName)
        .join(", ")}`,
    );
  }
  if (ground.bom.singleSourceIntroduced.length) {
    verification.push(
      `Qualify alternate source or accept single-source risk for: ${ground.bom.singleSourceIntroduced.join(", ")}`,
    );
  }
  for (const c of electrical.slice(0, 3)) {
    verification.push(`Electrical review: ${c.text.slice(0, 120)}`);
  }
  if (!verification.length) {
    verification.push("Smoke review of schematic diff and BOM delta");
  }

  const rationaleParts: string[] = [];
  rationaleParts.push(
    `${ground.connectedComponents.length} component(s) and ${ground.touchedNets.length} net(s) in the impact neighborhood.`,
  );
  if (ground.bscSurface.length) {
    rationaleParts.push(
      `${ground.bscSurface.length} Board Support Contract surface change(s).`,
    );
  }
  if (ground.bom.costDeltaUsd != null) {
    rationaleParts.push(
      `BOM unit-cost delta ≈ $${ground.bom.costDeltaUsd.toFixed(3)}.`,
    );
  }
  if (ground.inFlight.filter((t) => t.superseded).length) {
    rationaleParts.push(
      `${ground.inFlight.filter((t) => t.superseded).length} open supplier transmittal(s) hold a superseded revision.`,
    );
  }

  const titleSeed =
    ground.bscSurface.find((b) => b.severity === "breaking")?.message ??
    ground.bom.lines[0]?.refdes ??
    ground.connectedComponents[0]?.refdes ??
    "design change";

  return {
    title: `ECO: ${titleSeed}`.slice(0, 120),
    rationale: rationaleParts.join(" "),
    affectedItems: uniqueAffected,
    requiredApprovals: [...new Set(approvals)],
    suggestedVerification: verification,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function analyzeImpactDeterministic(
  diff: ImpactDiffBundle,
  context: ImpactContext,
): DeterministicImpact {
  const touchedNets = collectTouchedNets(diff, context.snapshot);
  const connectedComponents = collectConnectedComponents(
    diff,
    context.snapshot,
    touchedNets,
  );
  return {
    touchedNets,
    connectedComponents,
    bscSurface: mapBscSurfaceImpact(context.bscChanges),
    bom: analyzeBomImpact(diff.bom ?? [], context.pricingByMpn),
    inFlight: analyzeInFlightTransmittals(
      context.openTransmittals,
      context.releasedRevisionId,
      context.headRevisionId ?? diff.headRevisionId,
    ),
    invalidatedTests: analyzeTestInvalidation(
      context.testEvidence,
      touchedNets,
      connectedComponents,
    ),
  };
}

/**
 * Full impact analysis. Steps 1–5 deterministic; step 6 uses local electrical
 * reasoning plus optional LLM claims gated by citation universe.
 */
export async function analyzeImpact(
  diff: ImpactDiffBundle,
  context: ImpactContext,
  opts?: { llm?: ImpactLlmFn },
): Promise<ImpactReport> {
  const ground = analyzeImpactDeterministic(diff, context);
  const local = localElectricalReasoning(diff, ground, context.snapshot);

  let grounded = [...local];
  let unverified: ImpactClaim[] = [];
  let dropped: string[] = [];

  if (opts?.llm) {
    const raw = await opts.llm(ground, diff);
    const gated = gateImpactClaims(raw, ground);
    grounded = [...grounded, ...gated.grounded];
    unverified = gated.unverified;
    dropped = gated.dropped;
    if (dropped.length) {
      console.warn(
        `[impact] dropped ${dropped.length} LLM claim(s) without valid citations`,
        dropped.slice(0, 5),
      );
    }
  }

  return {
    ...ground,
    electricalClaims: grounded,
    unverifiedClaims: unverified,
    droppedClaims: dropped,
    eco: draftEco(ground, grounded),
  };
}

/** Sync convenience — no LLM. */
export function analyzeImpactSync(
  diff: ImpactDiffBundle,
  context: ImpactContext,
): ImpactReport {
  const ground = analyzeImpactDeterministic(diff, context);
  const local = localElectricalReasoning(diff, ground, context.snapshot);
  return {
    ...ground,
    electricalClaims: local,
    unverifiedClaims: [],
    droppedClaims: [],
    eco: draftEco(ground, local),
  };
}
