"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export function CreateReviewForm({
  orgSlug,
  projectSlug,
  revisions,
}: {
  orgSlug: string;
  projectSlug: string;
  revisions: Array<{ id: string; message: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("Power net decoupling update");
  const [base, setBase] = useState(revisions[1]?.id ?? "");
  const [head, setHead] = useState(revisions[0]?.id ?? "");

  if (revisions.length < 2) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Need at least two revisions to open a Design Review. Seed fixtures first.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          baseRevisionId: base,
          headRevisionId: head,
        }),
      },
    );
    if (!res.ok) return;
    const j = (await res.json()) as { id: string };
    router.push(`/app/${orgSlug}/${projectSlug}/reviews/${j.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 border border-[var(--border)] p-4">
      <h2 className="text-sm text-[var(--text-muted)]">New Design Review</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-muted)]">
          Base
          <select
            className="mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 font-mono text-xs"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {r.message}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Head
          <select
            className="mt-1 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 font-mono text-xs"
            value={head}
            onChange={(e) => setHead(e.target.value)}
          >
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {r.message}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="submit">Create review</Button>
    </form>
  );
}
