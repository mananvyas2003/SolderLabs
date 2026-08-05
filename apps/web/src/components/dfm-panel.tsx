"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@flux/ui";

type Partner = { key: string; name: string; description: string };
type Job = {
  id: string;
  partnerKey: string;
  status: string;
  summary: string | null;
  createdAt: string;
  releaseId: string;
};
type Release = { id: string; tag: string };

export function DfmPanel({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseId, setReleaseId] = useState("");
  const [partnerKey, setPartnerKey] = useState("jlcpcb");
  const [msg, setMsg] = useState<string | null>(null);
  const [region, setRegion] = useState("local");

  async function load() {
    const [d, r] = await Promise.all([
      fetch(`/api/orgs/${orgSlug}/projects/${projectSlug}/dfm`).then((x) =>
        x.json(),
      ),
      fetch(`/api/orgs/${orgSlug}/projects/${projectSlug}/releases`).then((x) =>
        x.json(),
      ),
    ]);
    setPartners(d.partners ?? []);
    setJobs(d.jobs ?? []);
    setRegion(d.dataRegion ?? "local");
    setReleases(r.releases ?? []);
    if (!releaseId && r.releases?.[0]) setReleaseId(r.releases[0].id);
    if (d.partners?.[0] && partnerKey === "jlcpcb") {
      setPartnerKey(d.partners[0].key);
    }
  }

  useEffect(() => {
    void load();
  }, [orgSlug, projectSlug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/dfm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, partnerKey }),
      },
    );
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "DFM failed");
      return;
    }
    setMsg(j.summary);
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)]">
        Org residency:{" "}
        <span className="font-mono text-[var(--accent)]">{region}</span>
      </p>
      <form
        onSubmit={submit}
        className="space-y-3 border border-[var(--border)] p-4"
      >
        <h2 className="text-sm text-[var(--text-muted)]">Submit DFM job</h2>
        {!releases.length ? (
          <p className="text-sm text-[var(--text-muted)]">
            Publish a manufacturing release first.
          </p>
        ) : (
          <>
            <select
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 text-sm"
              value={releaseId}
              onChange={(e) => setReleaseId(e.target.value)}
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.tag}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 text-sm"
              value={partnerKey}
              onChange={(e) => setPartnerKey(e.target.value)}
            >
              {partners.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-muted)]">
              {partners.find((p) => p.key === partnerKey)?.description}
            </p>
            <Button type="submit">Run DFM</Button>
          </>
        )}
        {msg ? <p className="text-xs text-[var(--text-muted)]">{msg}</p> : null}
      </form>

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {jobs.map((j) => (
          <li
            key={j.id}
            className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
          >
            <div>
              <div className="font-medium">{j.partnerKey}</div>
              <div className="text-[var(--text-muted)]">{j.summary}</div>
              <div className="font-mono text-xs text-[var(--text-muted)]">
                {new Date(j.createdAt).toLocaleString()}
              </div>
            </div>
            <Badge tone={j.status === "passed" ? "success" : "danger"}>
              {j.status}
            </Badge>
          </li>
        ))}
        {!jobs.length ? (
          <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
            No DFM jobs yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
