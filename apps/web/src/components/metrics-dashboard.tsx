"use client";

import { useEffect, useState } from "react";

type Row = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  parseCompleted: number;
  parseSucceeded: number;
  parseSuccessRate: number | null;
  bscPullsLast7d: number;
  bscCheckFailed: number;
  bscCheckFailedCallSites: number;
  diffViewed: number;
  reviewMerged: number;
  aiFindingActions: number;
};

export function MetricsDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [eventCount, setEventCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((j) => {
        setRows(j.metrics ?? []);
        setNote(j.northStarNote ?? "");
        setEventCount(j.eventCount ?? 0);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) {
    return (
      <p className="text-sm text-[var(--danger)]">Failed to load metrics: {err}</p>
    );
  }

  const totalFailed = rows.reduce((n, r) => n + r.bscCheckFailed, 0);
  const totalSites = rows.reduce((n, r) => n + r.bscCheckFailedCallSites, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="bsc_check_failed"
          value={String(totalFailed)}
          hint="North-star: wedge caught a real firmware bug"
          emphasis
        />
        <Stat
          label="call sites found"
          value={String(totalSites)}
          hint="Sum of file:line hits on failed checks"
        />
        <Stat
          label="events stored"
          value={String(eventCount)}
          hint="Append-only product analytics log"
        />
      </div>

      {note ? (
        <p className="border-l-2 border-[var(--accent)] pl-3 text-sm text-[var(--text-muted)]">
          {note}
        </p>
      ) : null}

      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Org</th>
              <th className="px-3 py-2 font-medium">Parse success</th>
              <th className="px-3 py-2 font-medium">BSC pulls / 7d</th>
              <th className="px-3 py-2 font-medium">bsc_check_failed</th>
              <th className="px-3 py-2 font-medium">Call sites</th>
              <th className="px-3 py-2 font-medium">Diffs / merges</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-[var(--text-muted)]"
                >
                  No events yet — upload a revision, pull a BSC, or fail a
                  check.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.orgId}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2 font-medium">{r.orgName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.parseSuccessRate == null
                      ? "—"
                      : `${(r.parseSuccessRate * 100).toFixed(0)}%`}{" "}
                    <span className="text-[var(--text-muted)]">
                      ({r.parseSucceeded}/{r.parseCompleted})
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.bscPullsLast7d}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold text-[var(--accent)]">
                    {r.bscCheckFailed}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.bscCheckFailedCallSites}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                    {r.diffViewed} / {r.reviewMerged}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`border p-4 ${
        emphasis
          ? "border-[var(--accent)] bg-[var(--surface-2)]"
          : "border-[var(--border)]"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
