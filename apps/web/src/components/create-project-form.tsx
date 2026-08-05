"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export function CreateProjectForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/orgs/${orgSlug}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    if (!res.ok) return;
    const j = (await res.json()) as { slug: string };
    router.push(`/app/${orgSlug}/${j.slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-2 sm:flex-row">
      <Input
        placeholder="Blinky Board"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
        }}
        required
      />
      <Input
        placeholder="slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="font-mono"
        required
      />
      <Button type="submit">Create</Button>
    </form>
  );
}
