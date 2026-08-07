"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@solderlab/ui";

export function UploadRevisionForm({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("Schematic update");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("message", message);
      const res = await fetch(
        `/api/orgs/${orgSlug}/projects/${projectSlug}/revisions`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(j.error ?? "Upload failed");
        return;
      }
      setStatus(
        file.name.toLowerCase().endsWith(".kicad_sch")
          ? "Parsed schematic"
          : "Parsed project zip",
      );
      setFile(null);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Commit message"
      />
      <input
        type="file"
        accept=".zip,.kicad_sch,application/zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--text-muted)]"
      />
      <p className="text-[11px] text-[var(--text-subtle)]">
        KiCad project <span className="font-mono">.zip</span> or a single{" "}
        <span className="font-mono">.kicad_sch</span>
      </p>
      <Button type="submit" disabled={!file || busy}>
        {busy ? "Uploading…" : "Upload revision"}
      </Button>
      {status ? (
        <p className="text-xs text-[var(--text-muted)]">{status}</p>
      ) : null}
    </form>
  );
}
