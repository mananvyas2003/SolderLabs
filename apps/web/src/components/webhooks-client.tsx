"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@solderlab/ui";

export default function WebhooksClient({ orgSlug }: { orgSlug: string }) {
  const [hooks, setHooks] = useState<
    Array<{ id: string; url: string; events: string[]; active: boolean }>
  >([]);
  const [url, setUrl] = useState("https://example.com/solderlab-hook");

  async function load() {
    const res = await fetch(`/api/orgs/${orgSlug}/webhooks`);
    if (!res.ok) return;
    const j = (await res.json()) as { webhooks: typeof hooks };
    setHooks(j.webhooks ?? []);
  }

  useEffect(() => {
    void load();
  }, [orgSlug]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/orgs/${orgSlug}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/app/${orgSlug}`} className="text-sm text-[var(--accent)]">
        ← Org
      </Link>
      <h1 className="text-2xl font-semibold">Webhooks</h1>
      <form onSubmit={add} className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} required />
        <Button type="submit">Add</Button>
      </form>
      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] text-sm">
        {hooks.map((h) => (
          <li key={h.id} className="px-4 py-3">
            <div className="font-mono text-xs break-all">{h.url}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {h.events.join(", ")}
            </div>
          </li>
        ))}
        {!hooks.length ? (
          <li className="px-4 py-6 text-[var(--text-muted)]">No webhooks.</li>
        ) : null}
      </ul>
    </div>
  );
}
