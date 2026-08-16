"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrgSupplySettings, PartAlert, PartWatch } from "@solderlab/db";

export function SupplyDashboardClient({
  orgSlug,
  settings,
  watches,
  alerts,
  projectNames,
}: {
  orgSlug: string;
  settings: OrgSupplySettings;
  watches: PartWatch[];
  alerts: PartAlert[];
  projectNames: Record<string, string>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function ack(id: string) {
    const res = await fetch(`/api/orgs/${orgSlug}/supply/alerts/${id}`, {
      method: "POST",
    });
    setMsg(res.ok ? "Acknowledged" : "Ack failed");
    router.refresh();
  }

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/orgs/${orgSlug}/supply/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadTimeWeeksThreshold: Number(fd.get("leadTimeWeeksThreshold")),
        buildQty: Number(fd.get("buildQty")),
        priceChangePercent: Number(fd.get("priceChangePercent")),
        volumeTierQty: Number(fd.get("volumeTierQty")),
      }),
    });
    setMsg(res.ok ? "Settings saved" : "Save failed");
    router.refresh();
  }

  async function uploadCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/orgs/${orgSlug}/supply/catalog`, {
      method: "POST",
      body: fd,
    });
    const body = (await res.json()) as { error?: string; rows?: number };
    setMsg(res.ok ? `Imported ${body.rows ?? 0} catalog rows` : body.error ?? "Upload failed");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {msg ? <p className="text-sm text-[var(--text-muted)]">{msg}</p> : null}

      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <h2 className="text-sm font-semibold">Thresholds</h2>
        <form onSubmit={saveSettings} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Lead time weeks
            <input
              name="leadTimeWeeksThreshold"
              type="number"
              defaultValue={settings.leadTimeWeeksThreshold}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1"
            />
          </label>
          <label className="text-xs">
            Build qty
            <input
              name="buildQty"
              type="number"
              defaultValue={settings.buildQty}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1"
            />
          </label>
          <label className="text-xs">
            Price change %
            <input
              name="priceChangePercent"
              type="number"
              defaultValue={settings.priceChangePercent}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1"
            />
          </label>
          <label className="text-xs">
            Volume tier qty
            <input
              name="volumeTierQty"
              type="number"
              defaultValue={settings.volumeTierQty}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] sm:col-span-2"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <h2 className="text-sm font-semibold">Manual catalog CSV</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Columns: mpn, manufacturer, lifecycle, lastTimeBuyDate, leadTimeWeeks,
          stockTotal, priceQty, unitPrice
        </p>
        <form onSubmit={uploadCsv} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="file" name="file" accept=".csv,text/csv" required />
          <button
            type="submit"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Upload
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Open alerts</h2>
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded border border-[var(--border)]">
          {alerts.length === 0 ? (
            <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
              No open alerts.
            </li>
          ) : (
            alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-mono text-sm">
                    {a.severity} · {a.kind} · {a.mpn}
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">{a.detail}</p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {a.affectedProjects.map((id) => projectNames[id] ?? id).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void ack(a.id)}
                  className="text-xs text-[var(--accent)]"
                >
                  Acknowledge
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Watched MPNs</h2>
        <div className="overflow-x-auto rounded border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-2)] font-mono text-[11px] uppercase text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">MPN</th>
                <th className="px-3 py-2">Lifecycle</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Lead wk</th>
                <th className="px-3 py-2">lastCheckedAt</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {watches.map((w) => (
                <tr key={w.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono">{w.mpn}</td>
                  <td className="px-3 py-2">{w.lifecycleStatus}</td>
                  <td className="px-3 py-2">{w.stockTotal ?? "—"}</td>
                  <td className="px-3 py-2">{w.leadTimeWeeks ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {w.lastCheckedAt ?? "never"}
                    {w.lifecycleStatus === "unknown" ? " · stale" : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                    {w.lastError ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
