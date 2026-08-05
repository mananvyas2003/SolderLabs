"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@flux/ui";

type PubProject = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  starCount: number;
  orgSlug: string;
  orgName: string;
  revisionCount: number;
};

export default function ExplorePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PubProject[]>([]);

  useEffect(() => {
    fetch("/api/explore")
      .then((r) => r.json())
      .then((j) => setProjects(j.projects ?? []));
  }, []);

  async function star(p: PubProject) {
    await fetch(`/api/orgs/${p.orgSlug}/projects/${p.slug}/community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "star" }),
    });
    const j = await fetch("/api/explore").then((r) => r.json());
    setProjects(j.projects ?? []);
  }

  async function clone(p: PubProject) {
    const res = await fetch(
      `/api/orgs/${p.orgSlug}/projects/${p.slug}/community`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          targetOrgSlug: "flux-labs",
        }),
      },
    );
    if (!res.ok) return;
    const j = (await res.json()) as { orgSlug: string; projectSlug: string };
    router.push(`/app/${j.orgSlug}/${j.projectSlug}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Community
          </p>
          <h1 className="text-3xl font-semibold">Explore public hardware</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Star and fork open projects across Flux
          </p>
        </div>
        <Link href="/app" className="text-sm text-[var(--accent)]">
          Open app →
        </Link>
      </div>

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {projects.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
          >
            <div>
              <div className="font-medium">
                <span className="text-[var(--text-muted)]">{p.orgSlug}/</span>
                {p.slug}
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                {p.description || p.name}
              </div>
              <div className="mt-1 flex gap-2 text-xs text-[var(--text-muted)]">
                <Badge tone="accent">{p.starCount} stars</Badge>
                <span>{p.revisionCount} revisions</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => star(p)}>
                Star
              </Button>
              <Button onClick={() => clone(p)}>Fork</Button>
            </div>
          </li>
        ))}
        {!projects.length ? (
          <li className="px-4 py-10 text-sm text-[var(--text-muted)]">
            No public projects yet. Set a project&apos;s visibility to{" "}
            <strong>public</strong> in Settings.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
