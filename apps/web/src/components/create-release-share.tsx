"use client";

import { useState } from "react";
import { Button, Input } from "@solderlab/ui";

export function CreateReleaseShare({
  orgSlug,
  projectSlug,
  releaseId,
}: {
  orgSlug: string;
  projectSlug: string;
  releaseId: string;
}) {
  const [label, setLabel] = useState("PCBWay fab");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setLink(null);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/releases/${releaseId}/share`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, days: 14, allowGerbers: true, allowBom: true }),
      },
    );
    setBusy(false);
    if (!res.ok) return;
    const j = (await res.json()) as { path: string };
    setLink(`${window.location.origin}${j.path}`);
  }

  return (
    <div className="space-y-2 border border-[var(--border)] p-4">
      <p className="text-sm font-medium">CM / supplier share</p>
      <p className="text-xs text-[var(--text-muted)]">
        Expiring link to Gerbers + BOM only — never CAD source. Audit-logged.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-xs"
          placeholder="Recipient label"
        />
        <Button onClick={create} disabled={busy}>
          Create 14-day link
        </Button>
      </div>
      {link ? (
        <p className="break-all font-mono text-xs text-[var(--accent)]">{link}</p>
      ) : null}
    </div>
  );
}
