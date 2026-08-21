import type { EcoDraft, ImpactBscChange } from "./impact.ts";
import type { ElectricalChange } from "./semantic-diff.ts";
import type { BomDiffRow, ComponentDiff, NetDiff, PcbFootprintDiff } from "./types.ts";

export interface ArtifactDiffInput {
  baseRevisionId: string;
  headRevisionId: string;
  components: ComponentDiff[];
  bom: BomDiffRow[];
  nets: NetDiff[];
  pcb?: PcbFootprintDiff[];
  electrical?: {
    changes: ElectricalChange[];
    summary: { gate: "PASS" | "FAIL" };
  };
  summary: {
    componentsAdded: number;
    componentsRemoved: number;
    componentsChanged: number;
    bomChanged: number;
    netsAdded: number;
    netsRemoved: number;
    netsChanged: number;
    pcbAdded?: number;
    pcbRemoved?: number;
    pcbChanged?: number;
    significantElectrical?: number;
    criticalElectrical?: number;
    electricalGate?: "PASS" | "FAIL";
  };
}

export interface ArtifactCheckRow {
  name: string;
  status: string;
  summary: string | null;
}

export interface ArtifactRef {
  kind: "component" | "net" | "bom_line" | "check";
  ref: string;
}

export interface ChangelogEntry {
  section: "components" | "nets" | "bom" | "electrical" | "pcb" | "bsc";
  message: string;
  refs: ArtifactRef[];
}

export interface ReviewSynthesis {
  kind: "review";
  baseRevisionId: string;
  headRevisionId: string;
  electricalGate: "PASS" | "FAIL" | null;
  verdict: "verified";
  coverage: number;
  summary: ArtifactDiffInput["summary"];
  checks: ArtifactCheckRow[];
  electrical: Array<{ type: string; significance: string; message: string }>;
  eco: EcoDraft | null;
}

export interface ChangelogArtifact {
  kind: "changelog";
  title: string;
  baseRevisionId: string;
  headRevisionId: string;
  electricalGate: "PASS" | "FAIL" | null;
  entries: ChangelogEntry[];
  eco: EcoDraft | null;
}

export interface CommitNotes {
  kind: "commit";
  subject: string;
  body: string;
  trailers: string[];
  electricalGate: "PASS" | "FAIL" | null;
}

function gateOf(diff: ArtifactDiffInput): "PASS" | "FAIL" | null {
  return diff.summary.electricalGate ?? diff.electrical?.summary.gate ?? null;
}

function changed<T extends { kind: string }>(rows: T[]): T[] {
  return rows.filter((r) => r.kind !== "unchanged");
}

/** Identifiers the engine already named in this diff. */
export function diffIdentifierUniverse(diff: ArtifactDiffInput): Set<string> {
  const out = new Set<string>();
  for (const c of diff.components) {
    if (c.kind === "unchanged") continue;
    out.add(c.refdes);
  }
  for (const n of diff.nets) {
    if (n.kind === "unchanged") continue;
    out.add(n.name);
    if (n.beforeName) out.add(n.beforeName);
    if (n.afterName) out.add(n.afterName);
  }
  for (const b of diff.bom) {
    if (b.kind === "unchanged") continue;
    out.add(b.refdes);
  }
  for (const p of diff.pcb ?? []) {
    if (p.kind === "unchanged") continue;
    out.add(p.refdes);
  }
  for (const ch of diff.electrical?.changes ?? []) {
    if (ch.refdes) out.add(ch.refdes);
    if (ch.net) out.add(ch.net);
    if (ch.beforeNet) out.add(ch.beforeNet);
    if (ch.afterNet) out.add(ch.afterNet);
    if (ch.beforeName) out.add(ch.beforeName);
    if (ch.afterName) out.add(ch.afterName);
  }
  return out;
}

function electricalRows(diff: ArtifactDiffInput): ElectricalChange[] {
  return (diff.electrical?.changes ?? []).filter(
    (c) => c.significance !== "cosmetic",
  );
}

/**
 * Review rollup. Every field is copied from the engine; the model cannot
 * supply electricalGate or check status.
 */
export function generateReviewSynthesis(
  diff: ArtifactDiffInput,
  opts: { checks?: ArtifactCheckRow[]; eco?: EcoDraft | null } = {},
): ReviewSynthesis {
  const electricalGate = gateOf(diff);
  const electrical = electricalRows(diff).slice(0, 40).map((c) => ({
    type: c.type,
    significance: c.significance,
    message: c.message,
  }));
  return {
    kind: "review",
    baseRevisionId: diff.baseRevisionId,
    headRevisionId: diff.headRevisionId,
    electricalGate,
    verdict: "verified",
    coverage: electricalGate ? 1 : 0.5,
    summary: { ...diff.summary },
    checks: (opts.checks ?? []).map((c) => ({
      name: c.name,
      status: c.status,
      summary: c.summary,
    })),
    electrical,
    eco: opts.eco ?? null,
  };
}

export function generateChangelog(
  diff: ArtifactDiffInput,
  opts: { eco?: EcoDraft | null; bscChanges?: ImpactBscChange[] } = {},
): ChangelogArtifact {
  const entries: ChangelogEntry[] = [];
  for (const c of changed(diff.components)) {
    const fields = c.fields?.length ? ` [${c.fields.join(",")}]` : "";
    entries.push({
      section: "components",
      message: `${c.kind} ${c.refdes}${fields}`,
      refs: [{ kind: "component", ref: c.refdes }],
    });
  }
  for (const n of changed(diff.nets)) {
    const rename =
      n.beforeName && n.afterName && n.beforeName !== n.afterName
        ? `${n.beforeName} → ${n.afterName}`
        : n.name;
    entries.push({
      section: "nets",
      message: `${n.kind} ${rename}`,
      refs: [{ kind: "net", ref: n.afterName ?? n.name }],
    });
  }
  for (const b of changed(diff.bom)) {
    const fields = b.fields?.length ? ` [${b.fields.join(",")}]` : "";
    entries.push({
      section: "bom",
      message: `${b.kind} ${b.refdes}${fields}`,
      refs: [{ kind: "bom_line", ref: b.refdes }],
    });
  }
  for (const ch of electricalRows(diff)) {
    const refs: ArtifactRef[] = [];
    if (ch.refdes) refs.push({ kind: "component", ref: ch.refdes });
    const net = ch.afterNet ?? ch.net ?? ch.afterName;
    if (net) refs.push({ kind: "net", ref: net });
    entries.push({
      section: "electrical",
      message: ch.message,
      refs,
    });
  }
  for (const p of changed(diff.pcb ?? [])) {
    entries.push({
      section: "pcb",
      message: `${p.kind} ${p.refdes}`,
      refs: [{ kind: "component", ref: p.refdes }],
    });
  }
  for (const b of opts.bscChanges ?? []) {
    entries.push({
      section: "bsc",
      message: `${b.severity} ${b.kind}: ${b.message}`,
      refs: [],
    });
  }

  const title =
    opts.eco?.title ??
    electricalRows(diff)[0]?.message ??
    (entries[0] ? entries[0].message : "no engine-visible changes");

  return {
    kind: "changelog",
    title: title.slice(0, 160),
    baseRevisionId: diff.baseRevisionId,
    headRevisionId: diff.headRevisionId,
    electricalGate: gateOf(diff),
    entries,
    eco: opts.eco ?? null,
  };
}

export function generateCommitNotes(
  diff: ArtifactDiffInput,
  opts: { bscChanges?: ImpactBscChange[] } = {},
): CommitNotes {
  const s = diff.summary;
  const gate = gateOf(diff);
  const subject = `board: +${s.componentsAdded}/-${s.componentsRemoved}/~${s.componentsChanged} components; electricalGate=${gate ?? "n/a"}`;
  const lines: string[] = [
    `components +${s.componentsAdded}/-${s.componentsRemoved}/~${s.componentsChanged}`,
    `nets +${s.netsAdded}/-${s.netsRemoved}/~${s.netsChanged}`,
    `bom ${s.bomChanged}`,
  ];
  if (s.significantElectrical != null) {
    lines.push(`electrical significant=${s.significantElectrical} critical=${s.criticalElectrical ?? 0}`);
  }
  for (const ch of electricalRows(diff).slice(0, 12)) {
    lines.push(ch.message);
  }
  for (const b of (opts.bscChanges ?? []).filter((x) => x.severity === "breaking").slice(0, 8)) {
    lines.push(`BSC ${b.kind}: ${b.message}`);
  }
  const trailers = [
    `Electrical-Gate: ${gate ?? "n/a"}`,
    `Base: ${diff.baseRevisionId}`,
    `Head: ${diff.headRevisionId}`,
  ];
  const breaking = (opts.bscChanges ?? []).filter((x) => x.severity === "breaking").length;
  if (breaking) trailers.push(`BSC-Breaking: ${breaking}`);

  return {
    kind: "commit",
    subject: subject.slice(0, 72),
    body: lines.join("\n"),
    trailers,
    electricalGate: gate,
  };
}
