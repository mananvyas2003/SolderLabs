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
import {
  resolveIdentity,
  type IdentityMatch,
} from "./identity";

export * from "./types";
export * from "./semantic-diff";
export * from "./identity";
export * from "./impact";
export * from "./unintended-connectivity";
export * from "./bom-reconcile";
export * from "./bom-history";
export * from "./mfg-lint";
export * from "./shadow";
export * from "./artifacts";
export * from "./tier-b";
export * from "./output-class";

/** Power flags / #PWR* — noise for BOM and format-migration diffs. */
export function isPowerSymbol(c: {
  refdes: string;
  libId?: string;
}): boolean {
  if (c.refdes.startsWith("#")) return true;
  if (/^PWR\d/i.test(c.refdes)) return true;
  const lib = (c.libId ?? "").toLowerCase();
  return (
    lib.includes("power:") ||
    lib.includes("power_flag") ||
    lib.startsWith("power/") ||
    /\/power[_-]flag/.test(lib)
  );
}

export interface SnapshotDiffOptions extends DiffConfig {
  /**
   * When false (default), exclude power symbols from component/BOM diffs.
   * Pass true to include #PWR / power: flags.
   */
  includePowerSymbols?: boolean;
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
    boardsAdded?: number;
    boardsRemoved?: number;
  };
  boards?: Array<{ key: string; kind: "added" | "removed" | "unchanged" }>;
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
}

export function snapshotToBom(snapshot: DesignSnapshot): BomLineLike[] {
  return snapshot.components.map((c) => ({
    refdes: c.refdes,
    value: c.value,
    footprint: c.footprint,
    mpn: c.mpn,
    manufacturer: c.manufacturer,
    qty: 1,
    uuid: c.uuid,
  }));
}

function changedFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  keys: string[],
): string[] {
  return keys.filter((k) => String(a[k] ?? "") !== String(b[k] ?? ""));
}

function classifyMatchedComponent(m: IdentityMatch): ComponentDiff {
  const { base: before, head: after, tier } = m;
  const fields = changedFields(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    ["value", "footprint", "mpn", "manufacturer", "sheetId", "libId", "refdes"],
  );

  let kind: DiffChangeKind = "unchanged";
  if (before.sheetId !== after.sheetId) {
    kind = "sheet_moved";
  } else if (before.refdes !== after.refdes) {
    kind = "refdes_renamed";
  } else if (fields.length) {
    kind = "changed";
  }

  return {
    refdes: after.refdes,
    kind,
    before,
    after,
    fields: fields.length ? fields : undefined,
    matchTier: tier,
  };
}

function pinSetKey(nodes: string[]): string {
  return [...new Set(nodes)]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join("|");
}

/** Pin-set key ignoring power-flag endpoints — improves rename match across CAD versions. */
function signalPinSetKey(nodes: string[]): string {
  return pinSetKey(
    nodes.filter((n) => {
      const ref = n.split(".")[0] ?? "";
      return !ref.startsWith("#") && !/^PWR\d/i.test(ref);
    }),
  );
}

export function diffSnapshots(
  base: DesignSnapshot,
  head: DesignSnapshot,
  ids: { baseRevisionId: string; headRevisionId: string },
  cfg?: SnapshotDiffOptions,
): DiffBundleData {
  const includePower = cfg?.includePowerSymbols === true;
  const baseCompsAll = includePower
    ? base.components
    : base.components.filter((c) => !isPowerSymbol(c));
  const headCompsAll = includePower
    ? head.components
    : head.components.filter((c) => !isPowerSymbol(c));

  const baseBoardKeys = new Set(baseCompsAll.map((c) => c.boardKey ?? ""));
  const headBoardKeys = new Set(headCompsAll.map((c) => c.boardKey ?? ""));
  const addedBoardKeys = [...headBoardKeys].filter(
    (k) => k && !baseBoardKeys.has(k),
  );
  const removedBoardKeys = [...baseBoardKeys].filter(
    (k) => k && !headBoardKeys.has(k),
  );
  const addedBoardSet = new Set(addedBoardKeys);
  const removedBoardSet = new Set(removedBoardKeys);

  const baseComps = baseCompsAll.filter(
    (c) => !removedBoardSet.has(c.boardKey ?? ""),
  );
  const headComps = headCompsAll.filter(
    (c) => !addedBoardSet.has(c.boardKey ?? ""),
  );

  const identity = resolveIdentity(baseComps, headComps);

  const components: ComponentDiff[] = [];
  for (const m of identity.matched) {
    const row = classifyMatchedComponent(m);
    // Format-migration churn: UUID-stable parts whose CAD lib_id string changed
    // (KiCad 8→9 etc.) with no BOM change. Real refdes renames / sheet moves kept.
    if (m.tier === "uuid" && row.kind !== "unchanged") {
      const fields = row.fields ?? [];
      const noiseFields = new Set(["libId", "refdes", "sheetId"]);
      const onlyNoise =
        fields.length > 0 && fields.every((f) => noiseFields.has(f));
      const touchesLibId = fields.includes("libId");
      const sameBom =
        (m.base.value ?? "") === (m.head.value ?? "") &&
        (m.base.footprint ?? "") === (m.head.footprint ?? "") &&
        (m.base.mpn ?? "") === (m.head.mpn ?? "");
      if (onlyNoise && sameBom && touchesLibId) continue;
    }
    // libId-only tweaks on matched parts
    if (
      row.kind === "changed" &&
      row.fields?.length === 1 &&
      row.fields[0] === "libId"
    ) {
      continue;
    }
    components.push(row);
  }
  for (const before of identity.baseOnly) {
    components.push({ refdes: before.refdes, kind: "removed", before });
  }
  for (const after of identity.headOnly) {
    components.push({ refdes: after.refdes, kind: "added", after });
  }
  components.sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );

  const bom = diffBom(
    snapshotToBom({ ...base, components: baseComps }),
    snapshotToBom({ ...head, components: headComps }),
  );

  const baseNets = [...base.nets].filter(
    (n) => !removedBoardSet.has(n.boardKey ?? ""),
  );
  const headNets = [...head.nets].filter(
    (n) => !addedBoardSet.has(n.boardKey ?? ""),
  );
  const headNetUsed = new Set<number>();
  const nets: NetDiff[] = [];

  const headByPins = new Map<string, number[]>();
  headNets.forEach((n, i) => {
    const k = signalPinSetKey(n.nodes);
    if (!k) return;
    const list = headByPins.get(k) ?? [];
    list.push(i);
    headByPins.set(k, list);
  });

  const baseUsed = new Set<number>();
  baseNets.forEach((b, bi) => {
    const k = signalPinSetKey(b.nodes);
    if (!k) return;
    const candidates = headByPins.get(k);
    if (!candidates?.length) return;
    const hi = candidates.shift()!;
    if (candidates.length === 0) headByPins.delete(k);
    baseUsed.add(bi);
    headNetUsed.add(hi);
    const h = headNets[hi]!;
    if (b.name !== h.name) {
      nets.push({
        name: h.name,
        kind: "net_renamed",
        beforeNodes: b.nodes,
        afterNodes: h.nodes,
        beforeName: b.name,
        afterName: h.name,
      });
    } else {
      nets.push({
        name: h.name,
        kind: "unchanged",
        beforeNodes: b.nodes,
        afterNodes: h.nodes,
      });
    }
  });

  baseNets.forEach((b, bi) => {
    if (baseUsed.has(bi)) return;
    const hSameName = headNets.findIndex(
      (h, hi) =>
        !headNetUsed.has(hi) &&
        h.name === b.name &&
        (h.boardKey ?? "") === (b.boardKey ?? ""),
    );
    if (hSameName >= 0) {
      headNetUsed.add(hSameName);
      baseUsed.add(bi);
      const h = headNets[hSameName]!;
      const same = signalPinSetKey(b.nodes) === signalPinSetKey(h.nodes);
      nets.push({
        name: b.name,
        kind: same ? "unchanged" : "changed",
        beforeNodes: b.nodes,
        afterNodes: h.nodes,
      });
    }
  });

  baseNets.forEach((b, bi) => {
    if (baseUsed.has(bi)) return;
    nets.push({ name: b.name, kind: "removed", beforeNodes: b.nodes });
  });
  headNets.forEach((h, hi) => {
    if (headNetUsed.has(hi)) return;
    nets.push({ name: h.name, kind: "added", afterNodes: h.nodes });
  });

  nets.sort((a, b) => a.name.localeCompare(b.name));

  const significant = components.filter((c) => c.kind !== "unchanged");
  const netSig = nets.filter((n) => n.kind !== "unchanged");
  const electrical = semanticDiff(
    { ...base, components: baseComps, nets: baseNets },
    { ...head, components: headComps, nets: headNets },
    cfg,
  );

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
      componentsChanged: significant.filter(
        (c) =>
          c.kind === "changed" ||
          c.kind === "refdes_renamed" ||
          c.kind === "sheet_moved",
      ).length,
      bomChanged: bom.filter((r) => r.kind !== "unchanged").length,
      netsAdded: netSig.filter((n) => n.kind === "added").length,
      netsRemoved: netSig.filter((n) => n.kind === "removed").length,
      netsChanged: netSig.filter(
        (n) => n.kind === "changed" || n.kind === "net_renamed",
      ).length,
      significantElectrical: electrical.summary.significantCount,
      criticalElectrical: electrical.summary.criticalCount,
      electricalGate: electrical.summary.gate,
      boardsAdded: addedBoardKeys.length,
      boardsRemoved: removedBoardKeys.length,
    },
    boards: [
      ...addedBoardKeys.map((key) => ({ key, kind: "added" as const })),
      ...removedBoardKeys.map((key) => ({ key, kind: "removed" as const })),
    ],
  };
}

export function diffBom(base: BomLineLike[], head: BomLineLike[]): BomDiffRow[] {
  const rows: BomDiffRow[] = [];
  const headUsed = new Set<number>();
  const baseUsed = new Set<number>();

  // Prefer UUID identity so refdes renames are not delete+add
  const headByUuid = new Map<string, number>();
  head.forEach((h, i) => {
    if (h.uuid) headByUuid.set(h.uuid, i);
  });
  base.forEach((b, bi) => {
    if (!b.uuid) return;
    const hi = headByUuid.get(b.uuid);
    if (hi == null) return;
    baseUsed.add(bi);
    headUsed.add(hi);
    const after = head[hi]!;
    const fields = changedFields(
      b as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      ["value", "footprint", "mpn", "manufacturer", "refdes"],
    );
    // Format noise: ignore refdes-only BOM rows when UUID matched
    const meaningful = fields.filter((f) => f !== "refdes");
    rows.push({
      refdes: after.refdes,
      kind: meaningful.length ? "changed" : "unchanged",
      before: b,
      after,
      fields: meaningful.length ? meaningful : undefined,
    });
  });

  const headByRef = new Map<string, number>();
  head.forEach((h, i) => {
    if (headUsed.has(i)) return;
    headByRef.set(h.refdes, i);
  });
  base.forEach((b, bi) => {
    if (baseUsed.has(bi)) return;
    const hi = headByRef.get(b.refdes);
    if (hi == null) {
      rows.push({ refdes: b.refdes, kind: "removed", before: b });
      return;
    }
    baseUsed.add(bi);
    headUsed.add(hi);
    const after = head[hi]!;
    const fields = changedFields(
      b as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      ["value", "footprint", "mpn", "manufacturer"],
    );
    rows.push({
      refdes: b.refdes,
      kind: fields.length ? "changed" : "unchanged",
      before: b,
      after,
      fields: fields.length ? fields : undefined,
    });
  });
  head.forEach((h, hi) => {
    if (headUsed.has(hi)) return;
    rows.push({ refdes: h.refdes, kind: "added", after: h });
  });

  return rows.sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );
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
    for (const [i, row] of diff.bom.entries()) {
      if (row.kind === "added") {
        findings.push({
          id: `bom-add-${row.refdes}-${i}`,
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
        });
      } else if (row.kind === "removed") {
        findings.push({
          id: `bom-rm-${row.refdes}-${i}`,
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
          id: `bom-ch-${row.refdes}-${i}`,
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
        });
      }
    }

    for (const [i, ch] of (diff.electrical?.changes ?? []).entries()) {
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
        id: `elec-${ch.type}-${i}`,
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
      });
    }

    // Legacy net list fallback when electrical empty
    if (!diff.electrical?.changes.length) {
      for (const [i, n] of diff.nets
        .filter((x) => x.kind !== "unchanged")
        .entries()) {
        findings.push({
          id: `net-${n.name}-${i}`,
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
