"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@flux/ui";

export function ImportAltiumForm({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("message", `Import ${file.name}`);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/import`,
      { method: "POST", body: fd },
    );
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setStatus(j.error ?? "Import failed");
      return;
    }
    const j = (await res.json()) as { count: number };
    setStatus(`Imported ${j.count} components`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--text-muted)]">
        CSV headers: Ref,Value,Footprint,MPN
      </p>
      <input
        type="file"
        accept=".csv,.txt"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--text-muted)]"
      />
      <Button type="submit" disabled={!file}>
        Import
      </Button>
      {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
    </form>
  );
}
