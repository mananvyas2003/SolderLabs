"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "@flux/ui";

type Pin = { pin: string; name: string; net: string };
type PinoutRow = {
  id: string;
  revisionId: string;
  targetRefdes: string;
  dataJson: string;
};
type Rev = { id: string; message: string };

export function PinoutPanel({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [revs, setRevs] = useState<Rev[]>([]);
  const [revisionId, setRevisionId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [target, setTarget] = useState("U1");
  const [pins, setPins] = useState<Pin[]>([]);
  const [diff, setDiff] = useState<
    Array<{ pin: string; kind: string; before?: Pin; after?: Pin }>
  >([]);
  const [header, setHeader] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orgs/${orgSlug}/projects/${projectSlug}/revisions`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j.revisions ?? []) as Rev[];
        setRevs(list);
        if (list[0]) setRevisionId(list[0].id);
        if (list[1]) setCompareId(list[1].id);
      });
  }, [orgSlug, projectSlug]);

  async function sync() {
    setMsg(null);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/pinout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, targetRefdes: target }),
      },
    );
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Sync failed");
      return;
    }
    setPins(j.pinout?.pins ?? []);
    setHeader(j.header ?? "");
    setMsg(`Synced ${j.pinout?.pins?.length ?? 0} pins for ${target}`);
    await loadDiff();
    router.refresh();
  }

  async function loadDiff() {
    if (!revisionId) return;
    const q = new URLSearchParams({
      revisionId,
      target,
    });
    if (compareId) q.set("compare", compareId);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/pinout?${q}`,
    );
    const j = await res.json();
    setDiff(j.diff ?? []);
    const match = (j.pinouts as PinoutRow[] | undefined)?.find(
      (p) => p.targetRefdes.toUpperCase() === target.toUpperCase(),
    );
    if (match) {
      const doc = JSON.parse(match.dataJson) as { pins: Pin[] };
      setPins(doc.pins ?? []);
    }
  }

  useEffect(() => {
    void loadDiff();
  }, [revisionId, compareId, target]);

  return (
    <div className="space-y-6">
      <div className="grid gap-2 border border-[var(--border)] p-4 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-muted)]">
          Target refdes
          <Input
            className="mt-1 font-mono"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Revision
          <select
            className="mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 font-mono text-xs"
            value={revisionId}
            onChange={(e) => setRevisionId(e.target.value)}
          >
            {revs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {r.message}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Compare base (optional)
          <select
            className="mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 font-mono text-xs"
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
          >
            <option value="">—</option>
            {revs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {r.message}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="button" onClick={sync}>
            Sync from schematic
          </Button>
          {revisionId ? (
            <a
              className="rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
              href={`/api/orgs/${orgSlug}/projects/${projectSlug}/pinout?revisionId=${revisionId}&target=${encodeURIComponent(target)}&format=h`}
            >
              Download .h
            </a>
          ) : null}
        </div>
      </div>
      {msg ? <p className="text-xs text-[var(--text-muted)]">{msg}</p> : null}

      {diff.length ? (
        <section>
          <h2 className="mb-2 text-sm text-[var(--text-muted)]">Pinout delta</h2>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] text-sm">
            {diff.map((d) => (
              <li
                key={d.pin}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="font-mono">
                  pin {d.pin}: {d.before?.net ?? "—"} → {d.after?.net ?? "—"}
                </span>
                <Badge
                  tone={
                    d.kind === "added"
                      ? "success"
                      : d.kind === "removed"
                        ? "danger"
                        : "warn"
                  }
                >
                  {d.kind}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Pin</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => (
              <tr key={p.pin} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-mono text-[var(--accent)]">
                  {p.pin}
                </td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pins.length ? (
          <p className="px-3 py-6 text-sm text-[var(--text-muted)]">
            No pinout yet — sync from a revision (MCU often U1).
          </p>
        ) : null}
      </section>

      {header ? (
        <pre className="overflow-x-auto border border-[var(--border)] bg-[var(--surface-1)] p-4 font-mono text-xs text-[var(--text-muted)]">
          {header}
        </pre>
      ) : null}
    </div>
  );
}
