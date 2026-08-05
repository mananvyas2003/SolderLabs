import type {
  BomDiffRow,
  BomLineLike,
  ComponentDiff,
  DesignSnapshot,
  DiffChangeKind,
  NetDiff,
  PcbFootprintDiff,
  PcbSnapshot,
  SnapshotComponent,
} from "./types";
import {
  semanticDiff,
  type DiffConfig,
  type SemanticDiffResult,
} from "./semantic-diff";

export * from "./types";
export * from "./semantic-diff";

export interface DiffBundleData {
  baseRevisionId: string;
  headRevisionId: string;
  components: ComponentDiff[];
  bom: BomDiffRow[];
  nets: NetDiff[];
  pcb?: PcbFootprintDiff[];
  pcbBase?: PcbSnapshot | null;
  pcbHead?: PcbSnapshot | null;
  /** NetDiff-style semantic electrical diff */
  electrical?: SemanticDiffResult;
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

export interface CopilotFinding {
  id: string;
  severity: import("./types").FindingSeverity;
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
  cfg?: DiffConfig,
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
        ["value", "footprint", "mpn", "manufacturer", "sheetId", "libId"],
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
  const electrical = semanticDiff(base, head, cfg);

  return {
    baseRevisionId: ids.baseRevisionId,
    headRevisionId: ids.headRevisionId,
    components: significant,
    bom: bom.filter((r) => r.kind !== "unchanged"),
    nets: netSig,
    electrical,
    summary: {
      componentsAdded: significant.filter((c) => c.kind === "added").length,
      componentsRemoved: significant.filter((c) => c.kind === "removed").length,
      componentsChanged: significant.filter((c) => c.kind === "changed").length,
      bomChanged: bom.filter((r) => r.kind !== "unchanged").length,
      netsAdded: netSig.filter((n) => n.kind === "added").length,
      netsRemoved: netSig.filter((n) => n.kind === "removed").length,
      netsChanged: netSig.filter((n) => n.kind === "changed").length,
      significantElectrical: electrical.summary.significantCount,
      criticalElectrical: electrical.summary.criticalCount,
      electricalGate: electrical.summary.gate,
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
      diff.bom.find((b) => b.refdes === ref) ??
      diff.electrical?.changes.find(
        (c) => c.pin === ref || c.refdes === ref || c.net === ref,
      );
    if (!hit) {
      return {
        markdown: `Insufficient structured data for \`${ref}\` in this diff.`,
        findings: [],
      };
    }
    if ("message" in hit && hit.message) {
      findings.push({
        id: `explain-${ref}`,
        severity:
          hit.significance === "critical"
            ? "critical"
            : hit.significance === "significant"
              ? "high"
              : "info",
        title: hit.type,
        body: hit.message,
        evidence: [
          {
            kind: hit.pin || hit.net ? "net" : "component",
            ref: hit.pin ?? hit.net ?? hit.refdes ?? ref,
            revisionId: diff.headRevisionId,
            deepLink: `#elec-${encodeURIComponent(ref)}`,
          },
        ],
        confidence: 0.95,
      });
      return { markdown: findings[0].body, findings };
    }
    const kind = (hit as { kind: DiffChangeKind }).kind;
    findings.push({
      id: `explain-${ref}`,
      severity: kind === "removed" ? "high" : "info",
      title: `${ref} ${kind}`,
      body:
        kind === "changed" && "fields" in hit && hit.fields
          ? `Changed fields: ${(hit.fields as string[]).join(", ")}`
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
      `- [ ] Electrical connectivity reviewed (${summary.significantElectrical ?? 0} significant)`,
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
      ...(diff.electrical?.changes
        .filter((c) => c.significance !== "cosmetic")
        .slice(0, 12)
        .map((c) => `- ${c.message}`) ?? []),
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

  if (
    cmd.startsWith("/bom") ||
    cmd.startsWith("/risks") ||
    cmd.startsWith("/summarize") ||
    cmd.startsWith("/nets") ||
    cmd === ""
  ) {
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
          suggestedAction: row.after?.mpn
            ? undefined
            : "Assign an approved MPN before release",
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
        const sev: import("./types").FindingSeverity = fields.includes(
          "footprint",
        )
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

    for (const ch of diff.electrical?.changes ?? []) {
      if (ch.significance === "cosmetic" && !cmd.startsWith("/nets")) continue;
      const sev: import("./types").FindingSeverity =
        ch.significance === "critical"
          ? "critical"
          : ch.type === "PinConnectionChanged" ||
              ch.type === "NetMerged" ||
              ch.type === "NetSplit"
            ? "high"
            : ch.significance === "significant"
              ? "medium"
              : "info";
      findings.push({
        id: `elec-${ch.type}-${ch.message.slice(0, 40)}`,
        severity: sev,
        title: ch.type,
        body: ch.message,
        evidence: [
          {
            kind: ch.pin || ch.net ? "net" : "component",
            ref: ch.pin ?? ch.net ?? ch.refdes ?? ch.type,
            revisionId: diff.headRevisionId,
            deepLink: `#elec-${encodeURIComponent(ch.pin ?? ch.net ?? ch.refdes ?? ch.type)}`,
          },
        ],
        suggestedAction:
          ch.type === "NetMerged" && ch.significance === "critical"
            ? "Power nets shorted — do not merge until verified"
            : undefined,
        confidence: 0.9,
      });
    }

    // Legacy net list fallback when electrical empty
    if (!diff.electrical?.changes.length) {
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
  }

  const severityRank: Record<string, number> = {
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
        : `Found **${risky.length}** risk findings from Design Context Graph` +
          (summary.electricalGate
            ? ` (connectivity gate: ${summary.electricalGate}).`
            : ".");
    return { markdown: md, findings: risky };
  }

  if (cmd.startsWith("/bom")) {
    return {
      markdown: `BOM delta: **${summary.bomChanged}** lines changed (adds/removes/edits).`,
      findings: findings.filter((f) => f.id.startsWith("bom-")),
    };
  }

  if (cmd.startsWith("/nets")) {
    return {
      markdown: `Electrical changes: **${summary.significantElectrical ?? 0}** significant / **${summary.criticalElectrical ?? 0}** critical (gate ${summary.electricalGate ?? "n/a"}).`,
      findings: findings.filter((f) => f.id.startsWith("elec-")),
    };
  }

  const md = [
    `### Change summary`,
    ``,
    `- Components: +${summary.componentsAdded} / −${summary.componentsRemoved} / ~${summary.componentsChanged}`,
    `- BOM lines changed: ${summary.bomChanged}`,
    `- Nets: +${summary.netsAdded} / −${summary.netsRemoved} / ~${summary.netsChanged}`,
    `- Electrical: ${summary.significantElectrical ?? 0} significant, ${summary.criticalElectrical ?? 0} critical (gate ${summary.electricalGate ?? "n/a"})`,
    ``,
    findings.length
      ? `Generated **${findings.length}** evidence-linked findings.`
      : `No component/BOM deltas in structured data.`,
  ].join("\n");

  return { markdown: md, findings };
}
