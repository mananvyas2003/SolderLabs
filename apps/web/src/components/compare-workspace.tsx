"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { DiffBundleData, CopilotFinding, ImpactReport } from "@solderlab/design-core";
import { Badge, Button, Input } from "@solderlab/ui";
import Link from "next/link";
import { PcbDiffViewer } from "@/components/pcb-diff-viewer";
import { ImpactPanel } from "@/components/impact-panel";

async function trackClient(
  name: "diff_viewed" | "ai_finding_action",
  props: Record<string, unknown>,
  orgId?: string,
) {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, orgId: orgId ?? null, props }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function CompareWorkspace({
  orgSlug,
  projectSlug,
  base,
  head,
  reviewId,
  orgId,
}: {
  orgSlug: string;
  projectSlug: string;
  base: string;
  head: string;
  reviewId?: string;
  orgId?: string;
}) {
  const [diff, setDiff] = useState<DiffBundleData | null>(null);
  const [tab, setTab] = useState<
    "schematic" | "electrical" | "pcb" | "bom" | "impact" | "review"
  >("schematic");
  const [overlay, setOverlay] = useState(0.55);
  const [markdown, setMarkdown] = useState("");
  const [findings, setFindings] = useState<CopilotFinding[]>([]);
  const [command, setCommand] = useState("/summarize");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const viewedAt = useRef(Date.now());
  const diffRef = useRef<DiffBundleData | null>(null);

  useEffect(() => {
    fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/compare?base=${base}&head=${head}`,
    )
      .then((r) => r.json())
      .then((j) => {
        const data = j.data as DiffBundleData;
        setDiff(data);
        diffRef.current = data;
      });
  }, [orgSlug, projectSlug, base, head]);

  useEffect(() => {
    viewedAt.current = Date.now();
    return () => {
      const d = diffRef.current;
      if (!d) return;
      const changeCount =
        (d.components?.length ?? 0) +
        (d.nets?.length ?? 0) +
        (d.bom?.length ?? 0) +
        (d.electrical?.changes?.length ?? 0);
      void trackClient(
        "diff_viewed",
        {
          reviewId: reviewId ?? `${base}..${head}`,
          changeCount,
          timeOnViewMs: Math.max(0, Date.now() - viewedAt.current),
        },
        orgId,
      );
    };
  }, [base, head, reviewId, orgId]);

  useEffect(() => {
    if (tab !== "impact" || impact || impactLoading) return;
    setImpactLoading(true);
    fetch(`/api/orgs/${orgSlug}/projects/${projectSlug}/impact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevisionId: base,
        headRevisionId: head,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((j) => setImpact(j.data as ImpactReport))
      .catch(() => setImpact(null))
      .finally(() => setImpactLoading(false));
  }, [tab, impact, impactLoading, orgSlug, projectSlug, base, head]);

  const components = useMemo(() => diff?.components ?? [], [diff]);

  async function runCopilot(cmd: string) {
    setMarkdown("");
    setFindings([]);
    setTab("review");
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/copilot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevisionId: base,
          headRevisionId: head,
          command: cmd,
          message: cmd,
        }),
      },
    );
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value);
      const split = acc.split("__FINDINGS__");
      setMarkdown(split[0]);
      if (split[1]) {
        try {
          setFindings(JSON.parse(split[1].trim()));
        } catch {
          /* wait */
        }
      }
    }
  }

  function findingAction(
    finding: CopilotFinding,
    action: "dismissed" | "converted" | "ignored",
  ) {
    void trackClient(
      "ai_finding_action",
      { findingId: finding.id, action },
      orgId,
    );
    if (action === "dismissed" || action === "ignored") {
      setFindings((prev) => prev.filter((f) => f.id !== finding.id));
    }
    if (action === "converted") {
      const ref = finding.evidence[0]?.ref;
      if (ref) {
        setHighlight(ref);
        setTab("schematic");
      }
    }
  }

  async function createReview() {
    setCreating(true);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Review ${base.slice(0, 6)}…${head.slice(0, 6)}`,
          body: "Design Review from compare",
          baseRevisionId: base,
          headRevisionId: head,
        }),
      },
    );
    setCreating(false);
    if (!res.ok) return;
    const j = (await res.json()) as { id: string };
    window.location.href = `/app/${orgSlug}/${projectSlug}/reviews/${j.id}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Compare</h1>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {base.slice(0, 10)} → {head.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!reviewId ? (
            <Button
              variant="outline"
              onClick={createReview}
              disabled={creating}
            >
              Open Design Review
            </Button>
          ) : (
            <Link
              href={`/app/${orgSlug}/${projectSlug}/reviews/${reviewId}`}
              className="rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm"
            >
              Back to review
            </Link>
          )}
          <Button onClick={() => runCopilot("/summarize")}>/summarize</Button>
          <Button variant="outline" onClick={() => runCopilot("/risks")}>
            /risks
          </Button>
          <Button variant="outline" onClick={() => runCopilot("/bom")}>
            /bom
          </Button>
          <Button variant="outline" onClick={() => runCopilot("/nets")}>
            /nets
          </Button>
        </div>
      </div>

      {diff ? (
        <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
          <span>+{diff.summary.componentsAdded} comps</span>
          <span>−{diff.summary.componentsRemoved}</span>
          <span>~{diff.summary.componentsChanged}</span>
          <span>BOM {diff.summary.bomChanged}</span>
          <span>
            PCB +{diff.summary.pcbAdded ?? 0}/−{diff.summary.pcbRemoved ?? 0}
          </span>
          <span>
            Electrical {diff.summary.significantElectrical ?? 0} sig
            {diff.summary.criticalElectrical
              ? ` / ${diff.summary.criticalElectrical} crit`
              : ""}{" "}
            · gate {diff.summary.electricalGate ?? "—"}
          </span>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Loading diff…</p>
      )}

      <div className="flex gap-2 border-b border-[var(--border)] pb-2 text-sm">
        {(
          ["schematic", "electrical", "pcb", "bom", "impact", "review"] as const
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "electrical" && diff?.electrical ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Semantic connectivity diff (NetDiff-style). Gate:{" "}
            <span className="font-mono text-[var(--text)]">
              {diff.electrical.summary.gate}
            </span>{" "}
            · {diff.electrical.summary.significantCount} significant /{" "}
            {diff.electrical.summary.cosmeticCount} cosmetic /{" "}
            {diff.electrical.summary.criticalCount} critical
          </p>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
            {diff.electrical.changes.map((ch, i) => (
              <li
                key={`${ch.type}-${i}`}
                id={`elec-${encodeURIComponent(ch.pin ?? ch.net ?? ch.refdes ?? String(i))}`}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-mono text-xs text-[var(--accent)]">
                    {ch.type}
                  </div>
                  <div>{ch.message}</div>
                </div>
                <Badge
                  tone={
                    ch.significance === "critical"
                      ? "danger"
                      : ch.significance === "significant"
                        ? "warn"
                        : "info"
                  }
                >
                  {ch.significance}
                </Badge>
              </li>
            ))}
            {!diff.electrical.changes.length ? (
              <li className="px-3 py-4 text-sm text-[var(--text-muted)]">
                Electrically identical pin-sets (drawing moves ignored).
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === "pcb" && diff ? <PcbDiffViewer diff={diff} /> : null}

      {tab === "schematic" && (
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            Overlay
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={overlay}
              onChange={(e) => setOverlay(Number(e.target.value))}
              className="w-48 accent-[var(--accent)]"
            />
          </label>
          <div className="relative h-[420px] overflow-hidden border border-[var(--border)] bg-[var(--surface-1)]">
            <SchematicCanvas
              components={components}
              overlay={overlay}
              highlight={highlight}
            />
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {components.map((c) => (
              <li
                key={c.refdes}
                id={`comp-${c.refdes}`}
                className="flex items-center justify-between border border-[var(--border)] px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="font-mono text-[var(--accent)]"
                  onClick={() => setHighlight(c.refdes)}
                >
                  {c.refdes}
                </button>
                <Badge
                  tone={
                    c.kind === "added"
                      ? "success"
                      : c.kind === "removed"
                        ? "danger"
                        : "warn"
                  }
                >
                  {c.kind}
                  {c.fields ? `: ${c.fields.join(",")}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "bom" && diff && (
        <div className="overflow-x-auto border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Change</th>
                <th className="px-3 py-2">Before</th>
                <th className="px-3 py-2">After</th>
              </tr>
            </thead>
            <tbody>
              {diff.bom.map((row) => (
                <tr
                  key={row.refdes}
                  id={`bom-${row.refdes}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2 font-mono">{row.refdes}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        row.kind === "added"
                          ? "success"
                          : row.kind === "removed"
                            ? "danger"
                            : "warn"
                      }
                    >
                      {row.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                    {row.before
                      ? `${row.before.value} · ${row.before.mpn ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.after
                      ? `${row.after.value} · ${row.after.mpn ?? "—"}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "impact" && (
        <div>
          {impactLoading ? (
            <p className="text-sm text-[var(--text-muted)]">
              Analyzing impact…
            </p>
          ) : impact ? (
            <ImpactPanel report={impact} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Impact analysis unavailable for this pair.
            </p>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3 border border-[var(--border)] p-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runCopilot(command);
              }}
            >
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="font-mono"
                placeholder="/summarize · /risks · /bom · /nets · /explain C12"
              />
              <Button type="submit">Run</Button>
            </form>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text)]">
              {markdown || "Ask SolderLab Review about this diff."}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Findings
            </p>
            {findings.map((f) => (
              <div
                key={f.id}
                className="border border-[var(--border)] p-3"
              >
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => findingAction(f, "converted")}
                  className="w-full text-left hover:border-[var(--accent)]"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      tone={
                        f.severity === "critical" || f.severity === "high"
                          ? "danger"
                          : f.severity === "medium"
                            ? "warn"
                            : "info"
                      }
                    >
                      {f.severity}
                    </Badge>
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{f.body}</p>
                </motion.button>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                    onClick={() => findingAction(f, "dismissed")}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                    onClick={() => findingAction(f, "ignored")}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SchematicCanvas({
  components,
  overlay,
  highlight,
}: {
  components: DiffBundleData["components"];
  overlay: number;
  highlight: string | null;
}) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M 10 0 L 0 0 0 10"
            fill="none"
            stroke="var(--border)"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>
      <rect width="200" height="120" fill="url(#grid)" />
      {components.map((c) => {
        const after = c.after;
        const before = c.before;
        const ax = after?.x ?? before?.x ?? 40;
        const ay = after?.y ?? before?.y ?? 40;
        // Normalize kicad coords roughly into viewBox
        const x = ((ax % 200) + 200) % 200;
        const y = ((ay % 120) + 120) % 120;
        const color =
          c.kind === "added"
            ? "var(--success)"
            : c.kind === "removed"
              ? "var(--danger)"
              : "var(--accent-2)";
        const isHi = highlight === c.refdes;
        return (
          <g key={c.refdes} opacity={c.kind === "removed" ? 1 - overlay : overlay + 0.3}>
            <rect
              x={x - 8}
              y={y - 6}
              width="22"
              height="12"
              fill="none"
              stroke={color}
              strokeWidth={isHi ? 1.2 : 0.6}
            />
            <text
              x={x - 6}
              y={y + 2}
              fill={color}
              fontSize="4"
              fontFamily="var(--font-mono)"
            >
              {c.refdes}
            </text>
            {isHi ? (
              <circle
                cx={x + 3}
                cy={y}
                r="10"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="0.5"
                opacity="0.8"
              >
                <animate
                  attributeName="r"
                  values="8;12;8"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
