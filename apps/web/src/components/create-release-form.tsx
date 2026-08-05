"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export function CreateReleaseForm({
  orgSlug,
  projectSlug,
  revisions,
}: {
  orgSlug: string;
  projectSlug: string;
  revisions: Array<{ id: string; message: string }>;
}) {
  const router = useRouter();
  const [tag, setTag] = useState("v1.0.0");
  const [title, setTitle] = useState("Fab package");
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!revisions.length) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Upload a successful revision before cutting a release.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, title, revisionId, notes }),
      },
    );
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setError(j.error ?? "Failed");
      return;
    }
    const j = (await res.json()) as { id: string };
    router.push(`/app/${orgSlug}/${projectSlug}/releases/${j.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-[var(--border)] p-4">
      <Input value={tag} onChange={(e) => setTag(e.target.value)} required />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      <select
        className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 font-mono text-xs"
        value={revisionId}
        onChange={(e) => setRevisionId(e.target.value)}
      >
        {revisions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id.slice(0, 8)} — {r.message}
          </option>
        ))}
      </select>
      <Input
        placeholder="Fab notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <Button type="submit">Publish immutable release</Button>
    </form>
  );
}
