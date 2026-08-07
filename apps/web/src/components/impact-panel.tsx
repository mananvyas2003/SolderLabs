"use client";

import type { ImpactReport } from "@solderlab/design-core";
import { Badge } from "@solderlab/ui";

export function ImpactPanel({ report }: { report: ImpactReport }) {
  return (
    <div className="space-y-6">
      <section className="border border-[var(--border)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
          ECO draft
        </p>
        <h2 className="mt-1 text-lg font-semibold">{report.eco.title}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {report.eco.rationale}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <List
            title="Affected"
            items={report.eco.affectedItems}
          />
          <List
            title="Approvals"
            items={report.eco.requiredApprovals}
          />
          <List
            title="Verify"
            items={report.eco.suggestedVerification}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Touched nets" count={report.touchedNets.length}>
          <ul className="space-y-1 text-sm">
            {report.touchedNets.slice(0, 24).map((n) => (
              <li key={n.net} className="font-mono text-xs">
                {n.net}{" "}
                <span className="text-[var(--text-muted)]">
                  · {n.connectedRefdes.join(", ") || "—"}
                </span>
              </li>
            ))}
            {!report.touchedNets.length ? (
              <li className="text-[var(--text-muted)]">None</li>
            ) : null}
          </ul>
        </Card>
        <Card
          title="Connected components"
          count={report.connectedComponents.length}
        >
          <ul className="space-y-1 text-sm">
            {report.connectedComponents.slice(0, 24).map((c) => (
              <li key={c.refdes} className="flex items-center gap-2">
                <span className="font-mono text-xs">{c.refdes}</span>
                <Badge tone="info">{c.reason}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="BSC surface" count={report.bscSurface.length}>
          <ul className="space-y-2 text-sm">
            {report.bscSurface.map((b, i) => (
              <li key={`${b.kind}-${i}`}>
                <Badge
                  tone={b.severity === "breaking" ? "danger" : "warn"}
                >
                  {b.severity}
                </Badge>{" "}
                <span className="text-xs">{b.message}</span>
              </li>
            ))}
            {!report.bscSurface.length ? (
              <li className="text-[var(--text-muted)]">No BSC delta</li>
            ) : null}
          </ul>
        </Card>
        <Card title="BOM impact" count={report.bom.lines.length}>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Cost Δ{" "}
            {report.bom.costDeltaUsd == null
              ? "—"
              : `$${report.bom.costDeltaUsd.toFixed(3)}`}
            {" · "}
            Lead Δ{" "}
            {report.bom.leadTimeDeltaDays == null
              ? "—"
              : `${report.bom.leadTimeDeltaDays}d`}
          </p>
          {report.bom.singleSourceIntroduced.length ? (
            <p className="mb-2 text-xs text-[var(--danger)]">
              Single-source: {report.bom.singleSourceIntroduced.join(", ")}
            </p>
          ) : null}
          <ul className="space-y-1 text-xs font-mono">
            {report.bom.lines.slice(0, 16).map((l) => (
              <li key={l.refdes}>
                {l.refdes} {l.kind} {l.beforeMpn ?? "—"} → {l.afterMpn ?? "—"}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card
          title="In-flight suppliers"
          count={report.inFlight.filter((t) => t.superseded).length}
        >
          <ul className="space-y-1 text-sm">
            {report.inFlight.map((t) => (
              <li key={t.supplierId} className="text-xs">
                {t.supplierName}{" "}
                <span className="font-mono text-[var(--text-muted)]">
                  @{t.heldRevisionId.slice(0, 8)}
                </span>{" "}
                {t.superseded ? (
                  <Badge tone="danger">superseded</Badge>
                ) : (
                  <Badge tone="success">current</Badge>
                )}
              </li>
            ))}
            {!report.inFlight.length ? (
              <li className="text-[var(--text-muted)]">
                No open transmittals
              </li>
            ) : null}
          </ul>
        </Card>
        <Card
          title="Invalidated tests"
          count={report.invalidatedTests.length}
        >
          <ul className="space-y-2 text-sm">
            {report.invalidatedTests.map((t) => (
              <li key={t.testId}>
                <div className="font-medium">{t.testName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {t.reason}
                </div>
              </li>
            ))}
            {!report.invalidatedTests.length ? (
              <li className="text-[var(--text-muted)]">None</li>
            ) : null}
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Electrical claims (grounded)</h3>
        {report.electricalClaims.map((c, i) => (
          <div
            key={`g-${i}`}
            className="border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm"
          >
            <p>{c.text}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">
              {c.citations.map((x) => `${x.kind}:${x.ref}`).join(" · ")}
            </p>
          </div>
        ))}
        {!report.electricalClaims.length ? (
          <p className="text-sm text-[var(--text-muted)]">No grounded claims</p>
        ) : null}

        {report.unverifiedClaims.length ? (
          <>
            <h3 className="pt-2 text-sm font-medium text-[var(--text-muted)]">
              Unverified (LLM — citation incomplete)
            </h3>
            {report.unverifiedClaims.map((c, i) => (
              <div
                key={`u-${i}`}
                className="border border-dashed border-[var(--border)] p-3 text-sm opacity-50"
              >
                <span className="mr-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  unverified
                </span>
                {c.text}
              </div>
            ))}
          </>
        ) : null}
      </section>
    </div>
  );
}

function Card({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border)] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-xs">
        {items.slice(0, 12).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
