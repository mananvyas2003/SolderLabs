"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@solderlab/ui";

type Line = {
  id: string;
  refdes: string;
  value: string;
  footprint: string;
  mpn: string | null;
};

type Platform = {
  id: string;
  refdes: string;
  uuid: string | null;
  mpn: string | null;
  dnp: boolean;
  notes: string | null;
  lockedValue: string | null;
};

type Drift = {
  kind: string;
  refdes: string;
  message: string;
};

export function BomClient({
  orgSlug,
  projectSlug,
  lines,
  platform,
  drift,
  blame,
  revisionId,
}: {
  orgSlug: string;
  projectSlug: string;
  lines: Line[];
  platform: Platform[];
  drift: Drift[];
  blame: Record<string, unknown>;
  revisionId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mpn, setMpn] = useState("");
  const [saving, setSaving] = useState(false);
  const platformByRef = new Map(platform.map((p) => [p.refdes, p]));

  async function saveMeta(refdes: string, value: string, footprint: string) {
    setSaving(true);
    await fetch(`/api/orgs/${orgSlug}/projects/${projectSlug}/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refdes,
        mpn: mpn || null,
        lockedValue: value,
        lockedFootprint: footprint,
      }),
    });
    setSaving(false);
    window.location.reload();
  }

  const historyKey = selected
    ? Object.keys(blame).find(
        (k) => k === `ref:${selected}` || blame[k],
      ) ?? `ref:${selected}`
    : null;
  const events =
    selected && historyKey
      ? ((blame[`ref:${selected}`] ??
          Object.entries(blame).find(([k]) => k.endsWith(selected))?.[1] ??
          []) as Array<{
          revisionId: string;
          createdAt: string;
          authorName?: string;
          message?: string;
          changedFields: string[];
          before?: { value?: string; mpn?: string | null };
          after: { value?: string; mpn?: string | null };
        }>)
      : [];

  return (
    <div className="space-y-6">
      {drift.length ? (
        <div className="border border-[var(--warn)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-medium">BOM reconciliation</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
            {drift.map((d, i) => (
              <li key={i}>
                <Badge tone="warn">{d.kind}</Badge> {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 font-mono">Ref</th>
              <th className="px-3 py-2">Value (CAD)</th>
              <th className="px-3 py-2">Footprint</th>
              <th className="px-3 py-2">CAD MPN</th>
              <th className="px-3 py-2">Platform MPN</th>
              <th className="px-3 py-2">History</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const meta = platformByRef.get(l.refdes);
              return (
                <tr
                  key={l.id}
                  id={`bom-${l.refdes}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2 font-mono text-[var(--accent)]">
                    {l.refdes}
                  </td>
                  <td className="px-3 py-2">{l.value}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.footprint}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {l.mpn || (
                      <span className="text-[var(--warn)]">missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {meta?.mpn ?? "—"}
                    {meta?.dnp ? (
                      <Badge tone="info">DNP</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-[var(--accent)]"
                      onClick={() => {
                        setSelected(l.refdes);
                        setMpn(meta?.mpn ?? l.mpn ?? "");
                      }}
                    >
                      blame
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="border border-[var(--border)] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Line history · {selected}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Prefer UUID identity when present · rev {revisionId?.slice(0, 8)}
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={mpn}
                onChange={(e) => setMpn(e.target.value)}
                placeholder="Platform MPN"
                className="font-mono text-xs"
              />
              <Button
                disabled={saving}
                onClick={() => {
                  const line = lines.find((l) => l.refdes === selected);
                  if (!line) return;
                  void saveMeta(selected, line.value, line.footprint);
                }}
              >
                Set MPN
              </Button>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {events.length ? (
              events.map((e, i) => (
                <li key={i} className="border-t border-[var(--border)] pt-2 text-xs">
                  <span className="font-medium">
                    {e.authorName ?? "unknown"}
                  </span>{" "}
                  <span className="text-[var(--text-muted)]">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <div className="font-mono text-[var(--accent)]">
                    {e.changedFields.join(", ")}
                  </div>
                  <div className="text-[var(--text-muted)]">
                    {e.before
                      ? `${e.before.value ?? ""} / ${e.before.mpn ?? "—"} → `
                      : "added · "}
                    {e.after.value ?? ""} / {e.after.mpn ?? "—"}
                  </div>
                  {e.message ? (
                    <div className="mt-0.5">{e.message}</div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-[var(--text-muted)]">
                No history events yet for this line.
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
