"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || name }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setError(j.error ?? "Failed");
      return;
    }
    const j = (await res.json()) as { slug: string };
    router.push(`/app/${j.slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-2 sm:flex-row">
      <Input
        placeholder="Name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
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
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}
