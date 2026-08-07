"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@solderlab/ui";

export function SeedFixturesButton({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function seed() {
    if (loading) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/projects/${projectSlug}/seed-fixtures?force=1`,
        { method: "POST" },
      );
      if (!res.ok) {
        setMsg("Seed failed");
        return;
      }
      const j = (await res.json()) as { skipped?: boolean };
      setMsg(j.skipped ? "Already seeded" : "Seeded r1 + r2");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => void seed()}
        disabled={loading}
      >
        {loading ? "Seeding…" : "Seed blinky fixtures"}
      </Button>
      {msg ? <span className="text-xs text-[var(--text-muted)]">{msg}</span> : null}
    </div>
  );
}
