"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("Uploading…");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("message", message);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/revisions`,
      { method: "POST", body: fd },
    );
    if (!res.ok) {
      setStatus("Upload failed");
      return;
    }
    setStatus("Parsed");
    setFile(null);
    router.refresh();
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
        accept=".zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--text-muted)]"
      />
      <Button type="submit" disabled={!file}>
        Upload KiCad zip
      </Button>
      {status ? (
        <p className="text-xs text-[var(--text-muted)]">{status}</p>
      ) : null}
    </form>
  );
}
