"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@solderlab/ui";

export function ReviewActions({
  orgSlug,
  projectSlug,
  reviewId,
  state,
}: {
  orgSlug: string;
  projectSlug: string;
  reviewId: string;
  state: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(action: string) {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/projects/${projectSlug}/reviews/${reviewId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) {
        const j = (await res.json()) as {
          error?: string;
          failing?: Array<{ name: string; summary: string | null }>;
        };
        setError(
          j.failing?.length
            ? `${j.error}: ${j.failing.map((f) => f.name).join(", ")}`
            : j.error ?? "Action failed",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {state !== "merged" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => void act("approve")}
            >
              {busy === "approve" ? "…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void act("request-changes")}
            >
              {busy === "request-changes" ? "…" : "Request changes"}
            </Button>
            <Button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void act("merge")}
            >
              {busy === "merge" ? "…" : "Merge"}
            </Button>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="max-w-sm text-right text-xs text-[var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}
