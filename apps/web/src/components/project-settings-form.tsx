"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@solderlab/ui";

export function ProjectSettingsForm({
  orgSlug,
  projectSlug,
  requireGreenChecks,
  requireApproval,
}: {
  orgSlug: string;
  projectSlug: string;
  requireGreenChecks: boolean;
  requireApproval: boolean;
  visibility?: string;
}) {
  const router = useRouter();
  const [green, setGreen] = useState(requireGreenChecks);
  const [approval, setApproval] = useState(requireApproval);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `/api/orgs/${orgSlug}/projects/${projectSlug}/settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireGreenChecks: green,
          requireApproval: approval,
        }),
      },
    );
    setMsg(res.ok ? "Saved" : "Failed");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3 border border-[var(--border)] p-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={green}
          onChange={(e) => setGreen(e.target.checked)}
        />
        Require green checks to merge
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={approval}
          onChange={(e) => setApproval(e.target.checked)}
        />
        Require approval before merge
      </label>
      <Button type="submit">Save</Button>
      {msg ? <p className="text-xs text-[var(--text-muted)]">{msg}</p> : null}
    </form>
  );
}
