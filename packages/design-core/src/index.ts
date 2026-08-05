export type FindingSeverity = "critical" | "high" | "medium" | "info";

export interface SnapshotPin {
  number: string;
  name: string;
  net: string;
}

export interface SnapshotComponent {
  refdes: string;
  value: string;
  footprint: string;
  mpn?: string;
  manufacturer?: string;
  sheetId: string;
  pins?: SnapshotPin[];
  /** Optional schematic symbol position for visual diff (mm or schematic units) */
  x?: number;
  y?: number;
}

export interface SnapshotNet {
  name: string;
  class?: "power" | "signal" | "ground" | string;
  nodes: string[];
}

export interface SnapshotSheet {
  id: string;
  name: string;
  title?: string;
}

export interface DesignSnapshot {
  schemaVersion: 1;
  tool: { name: string; version?: string };
  sheets: SnapshotSheet[];
  components: SnapshotComponent[];
  nets: SnapshotNet[];
  meta: {
    sheetCount: number;
    componentCount: number;
    netCount?: number;
  };
}

export interface BomLineLike {
  refdes: string;
  value: string;
  footprint: string;
  mpn?: string;
  manufacturer?: string;
  qty?: number;
}

export type DiffChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface ComponentDiff {
  refdes: string;
  kind: DiffChangeKind;
  before?: SnapshotComponent;
  after?: SnapshotComponent;
  fields?: string[];
}

export interface BomDiffRow {
  refdes: string;
  kind: DiffChangeKind;
  before?: BomLineLike;
  after?: BomLineLike;
  fields?: string[];
}

export interface NetDiff {
  name: string;
  kind: DiffChangeKind;
  beforeNodes?: string[];
  afterNodes?: string[];
}

export interface PcbFootprint {
  refdes: string;
  footprint: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: string;
}

export interface PcbTrack {
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface PcbSnapshot {
  schemaVersion: 1;
  outline: Array<{ x: number; y: number }>;
  footprints: PcbFootprint[];
  tracks: PcbTrack[];
  layers: string[];
  meta: {
    footprintCount: number;
    trackCount: number;
    widthMm?: number;
    heightMm?: number;
  };
}

export interface PcbFootprintDiff {
  refdes: string;
  kind: DiffChangeKind;
  before?: PcbFootprint;
  after?: PcbFootprint;
  fields?: string[];
}

export interface DiffBundleData {
  baseRevisionId: string;
  headRevisionId: string;
  components: ComponentDiff[];
  bom: BomDiffRow[];
  nets: NetDiff[];
  pcb?: PcbFootprintDiff[];
  pcbBase?: PcbSnapshot | null;
  pcbHead?: PcbSnapshot | null;
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
  };
}

export interface CopilotFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  body: string;
  evidence: Array<{
    kind: "component" | "net" | "sheet_region" | "bom_line" | "check_run";
    ref: string;
    revisionId: string;
    deepLink: string;
  }>;
  suggestedAction?: string;
  confidence: number;
}

export function snapshotToBom(snapshot: DesignSnapshot): BomLineLike[] {
  return snapshot.components.map((c) => ({
    refdes: c.refdes,
    value: c.value,
    footprint: c.footprint,
    mpn: c.mpn,
    manufacturer: c.manufacturer,
    qty: 1,
  }));
}

function componentKey(c: SnapshotComponent): string {
  return c.refdes;
}

function changedFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  keys: string[],
): string[] {
  return keys.filter((k) => String(a[k] ?? "") !== String(b[k] ?? ""));
}

export function diffSnapshots(
  base: DesignSnapshot,
  head: DesignSnapshot,
  ids: { baseRevisionId: string; headRevisionId: string },
): DiffBundleData {
  const baseMap = new Map(base.components.map((c) => [componentKey(c), c]));
  const headMap = new Map(head.components.map((c) => [componentKey(c), c]));
  const allRefdes = new Set([...baseMap.keys(), ...headMap.keys()]);

  const components: ComponentDiff[] = [];
  for (const refdes of [...allRefdes].sort()) {
    const before = baseMap.get(refdes);
    const after = headMap.get(refdes);
    if (before && !after) {
      components.push({ refdes, kind: "removed", before });
    } else if (!before && after) {
      components.push({ refdes, kind: "added", after });
    } else if (before && after) {
      const fields = changedFields(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        ["value", "footprint", "mpn", "manufacturer", "sheetId"],
      );
      components.push({
        refdes,
        kind: fields.length ? "changed" : "unchanged",
        before,
        after,
        fields: fields.length ? fields : undefined,
      });
    }
  }

  const bom = diffBom(snapshotToBom(base), snapshotToBom(head));

  const baseNets = new Map(base.nets.map((n) => [n.name, n]));
  const headNets = new Map(head.nets.map((n) => [n.name, n]));
  const allNets = new Set([...baseNets.keys(), ...headNets.keys()]);
  const nets: NetDiff[] = [];
  for (const name of [...allNets].sort()) {
    const b = baseNets.get(name);
    const h = headNets.get(name);
    if (b && !h) {
      nets.push({ name, kind: "removed", beforeNodes: b.nodes });
    } else if (!b && h) {
      nets.push({ name, kind: "added", afterNodes: h.nodes });
    } else if (b && h) {
      const same =
        JSON.stringify([...b.nodes].sort()) ===
        JSON.stringify([...h.nodes].sort());
      nets.push({
        name,
        kind: same ? "unchanged" : "changed",
        beforeNodes: b.nodes,
        afterNodes: h.nodes,
      });
    }
  }

  const significant = components.filter((c) => c.kind !== "unchanged");
  const netSig = nets.filter((n) => n.kind !== "unchanged");

  return {
    baseRevisionId: ids.baseRevisionId,
    headRevisionId: ids.headRevisionId,
    components: significant,
    bom: bom.filter((r) => r.kind !== "unchanged"),
    nets: netSig,
    summary: {
      componentsAdded: significant.filter((c) => c.kind === "added").length,
      componentsRemoved: significant.filter((c) => c.kind === "removed").length,
      componentsChanged: significant.filter((c) => c.kind === "changed").length,
      bomChanged: bom.filter((r) => r.kind !== "unchanged").length,
      netsAdded: netSig.filter((n) => n.kind === "added").length,
      netsRemoved: netSig.filter((n) => n.kind === "removed").length,
      netsChanged: netSig.filter((n) => n.kind === "changed").length,
    },
  };
}

export function diffBom(base: BomLineLike[], head: BomLineLike[]): BomDiffRow[] {
  const baseMap = new Map(base.map((b) => [b.refdes, b]));
  const headMap = new Map(head.map((b) => [b.refdes, b]));
  const all = new Set([...baseMap.keys(), ...headMap.keys()]);
  const rows: BomDiffRow[] = [];

  for (const refdes of [...all].sort()) {
    const before = baseMap.get(refdes);
    const after = headMap.get(refdes);
    if (before && !after) {
      rows.push({ refdes, kind: "removed", before });
    } else if (!before && after) {
      rows.push({ refdes, kind: "added", after });
    } else if (before && after) {
      const fields = changedFields(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        ["value", "footprint", "mpn", "manufacturer"],
      );
      rows.push({
        refdes,
        kind: fields.length ? "changed" : "unchanged",
        before,
        after,
        fields: fields.length ? fields : undefined,
      });
    }
  }
  return rows;
}

export function diffPcbSnapshots(
  base: PcbSnapshot | null | undefined,
  head: PcbSnapshot | null | undefined,
): {
  pcb: PcbFootprintDiff[];
  summary: { pcbAdded: number; pcbRemoved: number; pcbChanged: number };
} {
  const baseMap = new Map((base?.footprints ?? []).map((f) => [f.refdes, f]));
  const headMap = new Map((head?.footprints ?? []).map((f) => [f.refdes, f]));
  const all = new Set([...baseMap.keys(), ...headMap.keys()]);
  const pcb: PcbFootprintDiff[] = [];
  for (const refdes of [...all].sort()) {
    const before = baseMap.get(refdes);
    const after = headMap.get(refdes);
    if (before && !after) pcb.push({ refdes, kind: "removed", before });
    else if (!before && after) pcb.push({ refdes, kind: "added", after });
    else if (before && after) {
      const fields = changedFields(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        ["footprint", "x", "y", "rotation", "layer"],
      );
      if (fields.length) {
        pcb.push({ refdes, kind: "changed", before, after, fields });
      }
    }
  }
  return {
    pcb,
    summary: {
      pcbAdded: pcb.filter((p) => p.kind === "added").length,
      pcbRemoved: pcb.filter((p) => p.kind === "removed").length,
      pcbChanged: pcb.filter((p) => p.kind === "changed").length,
    },
  };
}

export function attachPcbToDiff(
  diff: DiffBundleData,
  base: PcbSnapshot | null | undefined,
  head: PcbSnapshot | null | undefined,
): DiffBundleData {
  const { pcb, summary } = diffPcbSnapshots(base, head);
  return {
    ...diff,
    pcb,
    pcbBase: base ?? null,
    pcbHead: head ?? null,
    summary: { ...diff.summary, ...summary },
  };
}

/** Deterministic local Copilot when no LLM key — grounded on DiffBundle only */
export function localCopilotFindings(
  diff: DiffBundleData,
  command: string | undefined,
  explainTarget?: string,
): { markdown: string; findings: CopilotFinding[] } {
  const cmd = (command ?? "/summarize").toLowerCase();
  const findings: CopilotFinding[] = [];
  const { summary } = diff;

  if (cmd.startsWith("/explain") || explainTarget) {
    const ref = explainTarget ?? cmd.replace("/explain", "").trim();
    const hit =
      diff.components.find((c) => c.refdes === ref) ??
      diff.bom.find((b) => b.refdes === ref);
    if (!hit) {
      return {
        markdown: `Insufficient structured data for \`${ref}\` in this diff.`,
        findings: [],
      };
    }
    const kind = hit.kind;
    findings.push({
      id: `explain-${ref}`,
      severity: kind === "removed" ? "high" : "info",
      title: `${ref} ${kind}`,
      body:
        kind === "changed" && "fields" in hit && hit.fields
          ? `Changed fields: ${hit.fields.join(", ")}`
          : `Component ${ref} is ${kind} between revisions.`,
      evidence: [
        {
          kind: "component",
          ref,
          revisionId: diff.headRevisionId,
          deepLink: `#comp-${ref}`,
        },
      ],
      confidence: 0.95,
    });
    return { markdown: findings[0].body, findings };
  }

  if (cmd.startsWith("/checklist")) {
    const md = [
      "### Review checklist",
      "",
      `- [ ] Schematic visual diff reviewed (${summary.componentsChanged} changed comps)`,
      `- [ ] BOM delta reviewed (${summary.bomChanged} lines)`,
      `- [ ] PCB footprints checked (+${summary.pcbAdded ?? 0}/−${summary.pcbRemoved ?? 0})`,
      "- [ ] Power integrity / decoupling intent confirmed",
      "- [ ] Manufacturing notes updated if releasing",
    ].join("\n");
    return { markdown: md, findings: [] };
  }

  if (cmd.startsWith("/release-notes")) {
    const lines = [
      "### Draft release notes",
      "",
      ...diff.bom.map((row) => {
        if (row.kind === "added")
          return `- Add ${row.refdes}: ${row.after?.value ?? "?"}`;
        if (row.kind === "removed")
          return `- Remove ${row.refdes}: ${row.before?.value ?? "?"}`;
        return `- Change ${row.refdes}: ${(row.fields ?? []).join(", ")}`;
      }),
    ];
    return { markdown: lines.join("\n"), findings: [] };
  }

  if (cmd.startsWith("/alternates")) {
    const target = cmd.replace("/alternates", "").trim();
    const row =
      diff.bom.find((b) => b.refdes === target) ??
      diff.bom.find((b) => !b.after?.mpn || b.kind === "changed");
    if (!row) {
      return {
        markdown: "No BOM target for alternates in this diff.",
        findings: [],
      };
    }
    return {
      markdown: `Alternates for \`${row.refdes}\` require org library enrichment. Add second-source MPNs in Library → alternates field, then re-run.`,
      findings: [
        {
          id: `alt-${row.refdes}`,
          severity: "info",
          title: `Alternates for ${row.refdes}`,
          body: "Use org library alternates / parts enrichment.",
          evidence: [
            {
              kind: "bom_line",
              ref: row.refdes,
              revisionId: diff.headRevisionId,
              deepLink: `#bom-${row.refdes}`,
            },
          ],
          confidence: 0.6,
        },
      ],
    };
  }

  if (cmd.startsWith("/bom") || cmd.startsWith("/risks") || cmd.startsWith("/summarize") || cmd === "") {
    for (const row of diff.bom) {
      if (row.kind === "added") {
        findings.push({
          id: `bom-add-${row.refdes}`,
          severity: row.after?.mpn ? "info" : "medium",
          title: `BOM add ${row.refdes}`,
          body: row.after?.mpn
            ? `Added ${row.refdes}: ${row.after.value} (${row.after.mpn})`
            : `Added ${row.refdes}: ${row.after?.value ?? "?"} — missing MPN`,
          evidence: [
            {
              kind: "bom_line",
              ref: row.refdes,
              revisionId: diff.headRevisionId,
              deepLink: `#bom-${row.refdes}`,
            },
          ],
          suggestedAction: row.after?.mpn ? undefined : "Assign an approved MPN before release",
          confidence: 0.9,
        });
      } else if (row.kind === "removed") {
        findings.push({
          id: `bom-rm-${row.refdes}`,
          severity: "high",
          title: `BOM remove ${row.refdes}`,
          body: `Removed ${row.refdes} (${row.before?.value ?? "?"})`,
          evidence: [
            {
              kind: "bom_line",
              ref: row.refdes,
              revisionId: diff.baseRevisionId,
              deepLink: `#bom-${row.refdes}`,
            },
          ],
          confidence: 0.92,
        });
      } else if (row.kind === "changed") {
        const fields = row.fields ?? [];
        const sev: FindingSeverity = fields.includes("footprint")
          ? "critical"
          : fields.includes("mpn")
            ? "high"
            : "medium";
        findings.push({
          id: `bom-ch-${row.refdes}`,
          severity: sev,
          title: `BOM change ${row.refdes}`,
          body: `${row.refdes}: ${fields
            .map((f) => {
              const before = row.before as unknown as
                | Record<string, unknown>
                | undefined;
              const after = row.after as unknown as
                | Record<string, unknown>
                | undefined;
              return `${f} ${String(before?.[f] ?? "")} → ${String(after?.[f] ?? "")}`;
            })
            .join("; ")}`,
          evidence: [
            {
              kind: "bom_line",
              ref: row.refdes,
              revisionId: diff.headRevisionId,
              deepLink: `#bom-${row.refdes}`,
            },
          ],
          suggestedAction: fields.includes("footprint")
            ? "Re-verify land pattern and courtyard"
            : undefined,
          confidence: 0.93,
        });
      }
    }

    for (const n of diff.nets.filter((x) => x.kind !== "unchanged")) {
      findings.push({
        id: `net-${n.name}`,
        severity: n.kind === "removed" ? "high" : "medium",
        title: `Net ${n.name} ${n.kind}`,
        body: `Net \`${n.name}\` is ${n.kind}.`,
        evidence: [
          {
            kind: "net",
            ref: n.name,
            revisionId: diff.headRevisionId,
            deepLink: `#net-${encodeURIComponent(n.name)}`,
          },
        ],
        confidence: 0.85,
      });
    }
  }

  const severityRank: Record<FindingSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    info: 3,
  };
  findings.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );

  if (cmd.startsWith("/risks")) {
    const risky = findings.filter((f) =>
      ["critical", "high", "medium"].includes(f.severity),
    );
    const md =
      risky.length === 0
        ? "No medium+ risks detected from structured diff."
        : `Found **${risky.length}** risk findings from Design Context Graph.`;
    return { markdown: md, findings: risky };
  }

  if (cmd.startsWith("/bom")) {
    return {
      markdown: `BOM delta: **${summary.bomChanged}** lines changed (adds/removes/edits).`,
      findings: findings.filter((f) => f.id.startsWith("bom-")),
    };
  }

  const md = [
    `### Change summary`,
    ``,
    `- Components: +${summary.componentsAdded} / −${summary.componentsRemoved} / ~${summary.componentsChanged}`,
    `- BOM lines changed: ${summary.bomChanged}`,
    `- Nets: +${summary.netsAdded} / −${summary.netsRemoved} / ~${summary.netsChanged}`,
    ``,
    findings.length
      ? `Generated **${findings.length}** evidence-linked findings.`
      : `No component/BOM deltas in structured data.`,
  ].join("\n");

  return { markdown: md, findings };
}
