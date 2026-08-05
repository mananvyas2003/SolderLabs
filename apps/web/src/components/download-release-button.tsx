"use client";

import { useState } from "react";
import { Button } from "@flux/ui";

export function DownloadReleaseButton({
  orgSlug,
  projectSlug,
  releaseId,
}: {
  orgSlug: string;
  projectSlug: string;
  releaseId: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/releases/${releaseId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download" }),
      },
    );
    setBusy(false);
    if (!res.ok) return;
    const blob = await res.blob();
    const sha = res.headers.get("X-Flux-SHA256");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `release-${releaseId.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    if (sha) {
      // soft confirm in console / tooltip area
      console.info("Package SHA-256", sha);
    }
  }

  return (
    <Button type="button" onClick={download} disabled={busy}>
      {busy ? "Preparing…" : "Download manufacturing package"}
    </Button>
  );
}
