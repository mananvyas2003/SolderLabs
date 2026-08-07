"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  async function act(action: string) {
    setError(null);
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
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {state !== "merged" ? (
          <>
            <Button variant="outline" onClick={() => act("approve")}>
              Approve
            </Button>
            <Button variant="ghost" onClick={() => act("request-changes")}>
              Request changes
            </Button>
            <Button onClick={() => act("merge")}>Merge</Button>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="max-w-sm text-right text-xs text-[var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}
