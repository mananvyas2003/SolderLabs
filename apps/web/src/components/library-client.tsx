"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input } from "@flux/ui";

type Part = {
  id: string;
  mpn: string;
  manufacturer: string | null;
  footprint: string | null;
  status: string;
  notes: string | null;
  alternatesJson: string | null;
};

export default function LibraryClient({ orgSlug }: { orgSlug: string }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [mpn, setMpn] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [status, setStatus] = useState("approved");
  const [alternates, setAlternates] = useState("");

  async function load() {
    const res = await fetch(`/api/orgs/${orgSlug}/library`);
    const j = (await res.json()) as { parts: Part[] };
    setParts(j.parts ?? []);
  }

  useEffect(() => {
    void load();
  }, [orgSlug]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/orgs/${orgSlug}/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpn,
        manufacturer,
        status,
        alternates: alternates
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setMpn("");
    setManufacturer("");
    setAlternates("");
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href={`/app/${orgSlug}`} className="text-sm text-[var(--accent)]">
        ← Org
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Component library</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Approved / forbidden MPNs used by BOM policy checks.
        </p>
      </div>

      <form onSubmit={add} className="grid gap-2 border border-[var(--border)] p-4 sm:grid-cols-2">
        <Input placeholder="MPN" value={mpn} onChange={(e) => setMpn(e.target.value)} required />
        <Input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
        >
          <option value="approved">approved</option>
          <option value="forbidden">forbidden</option>
          <option value="review">review</option>
        </select>
        <Input
          placeholder="Alternates (comma MPN)"
          value={alternates}
          onChange={(e) => setAlternates(e.target.value)}
        />
        <Button type="submit" className="sm:col-span-2">
          Add part
        </Button>
      </form>

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {parts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <div className="font-mono text-[var(--accent)]">{p.mpn}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {p.manufacturer || "—"}
                {p.alternatesJson
                  ? ` · alts: ${(JSON.parse(p.alternatesJson) as string[]).join(", ")}`
                  : ""}
              </div>
            </div>
            <Badge
              tone={
                p.status === "approved"
                  ? "success"
                  : p.status === "forbidden"
                    ? "danger"
                    : "warn"
              }
            >
              {p.status}
            </Badge>
          </li>
        ))}
        {!parts.length ? (
          <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
            Library empty — add approved parts to enable BOM policy.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
