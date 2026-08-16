"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@solderlab/ui";

export function ProjectSettingsForm({
  orgSlug,
  projectSlug,
  requireGreenChecks,
  requireApproval,
  requiredApprovals,
}: {
  orgSlug: string;
  projectSlug: string;
  requireGreenChecks: boolean;
  requireApproval: boolean;
  requiredApprovals: number;
  visibility?: string;
}) {
  const router = useRouter();
  const [green, setGreen] = useState(requireGreenChecks);
  const [approval, setApproval] = useState(requireApproval);
  const [n, setN] = useState(requiredApprovals);
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
          requiredApprovals: n,
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
      <label className="flex items-center gap-2 text-sm">
        Approvals required
        <input
          type="number"
          min={1}
          max={20}
          className="w-16 border border-[var(--border)] bg-transparent px-2 py-0.5"
          value={n}
          onChange={(e) => setN(Number(e.target.value) || 1)}
        />
      </label>
      <Button type="submit">Save</Button>
      {msg ? <p className="text-xs text-[var(--text-muted)]">{msg}</p> : null}
    </form>
  );
}
