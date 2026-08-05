"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export function CommentForm({
  orgSlug,
  projectSlug,
  reviewId,
}: {
  orgSlug: string;
  projectSlug: string;
  reviewId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [anchorKind, setAnchorKind] = useState("component");
  const [anchorRef, setAnchorRef] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/reviews/${reviewId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          body,
          anchorKind: anchorRef ? anchorKind : undefined,
          anchorRef: anchorRef || undefined,
        }),
      },
    );
    setBody("");
    setAnchorRef("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
      <p className="text-xs text-[var(--text-muted)]">
        Anchor to part / net / region (optional)
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={anchorKind}
          onChange={(e) => setAnchorKind(e.target.value)}
          className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 text-xs"
        >
          <option value="component">part</option>
          <option value="net">net</option>
          <option value="sheet_region">region</option>
        </select>
        <Input
          placeholder="e.g. C12 or VDD"
          value={anchorRef}
          onChange={(e) => setAnchorRef(e.target.value)}
          className="max-w-[160px] font-mono"
        />
      </div>
      <Input
        placeholder="Leave a review comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <Button type="submit">Comment</Button>
    </form>
  );
}
