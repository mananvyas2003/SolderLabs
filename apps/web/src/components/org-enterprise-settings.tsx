"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Badge } from "@flux/ui";
import { DATA_REGIONS } from "@/lib/regions";

export function OrgEnterpriseSettings({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [dataRegion, setDataRegion] = useState("local");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoDomain, setSsoDomain] = useState("");
  const [ssoEntityId, setSsoEntityId] = useState("");
  const [ssoEntryUrl, setSsoEntryUrl] = useState("");
  const [ssoCertificate, setSsoCertificate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orgs/${orgSlug}/settings`)
      .then((r) => r.json())
      .then((j) => {
        if (j.org) {
          setDataRegion(j.org.dataRegion ?? "local");
          setSsoEnabled(!!j.org.ssoEnabled);
          setSsoDomain(j.org.ssoDomain ?? "");
          setSsoEntityId(j.org.ssoEntityId ?? "");
          setSsoEntryUrl(j.org.ssoEntryUrl ?? "");
          setSsoCertificate(j.org.ssoCertificate ?? "");
        }
      });
  }, [orgSlug]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/orgs/${orgSlug}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataRegion,
        ssoEnabled,
        ssoDomain: ssoDomain || null,
        ssoEntityId: ssoEntityId || null,
        ssoEntryUrl: ssoEntryUrl || null,
        ssoCertificate: ssoCertificate || null,
      }),
    });
    setMsg(res.ok ? "Saved enterprise settings" : "Failed to save");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-3 border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">
          Data residency
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          New artifacts are stored under a region prefix (
          <code className="font-mono text-[var(--accent)]">regions/&lt;id&gt;/…</code>
          ).
        </p>
        <select
          value={dataRegion}
          onChange={(e) => setDataRegion(e.target.value)}
          className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
        >
          {DATA_REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} — {r.description}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3 border border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            SSO / SAML
          </h2>
          {ssoEnabled ? <Badge tone="success">enabled</Badge> : <Badge>off</Badge>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ssoEnabled}
            onChange={(e) => setSsoEnabled(e.target.checked)}
          />
          Enable enterprise SSO
        </label>
        <Input
          placeholder="Allowed email domain (e.g. acme.com)"
          value={ssoDomain}
          onChange={(e) => setSsoDomain(e.target.value)}
        />
        <Input
          placeholder="SAML Entity ID"
          value={ssoEntityId}
          onChange={(e) => setSsoEntityId(e.target.value)}
          className="font-mono text-xs"
        />
        <Input
          placeholder="IdP SSO entry URL"
          value={ssoEntryUrl}
          onChange={(e) => setSsoEntryUrl(e.target.value)}
          className="font-mono text-xs"
        />
        <textarea
          placeholder="IdP X.509 certificate (PEM)"
          value={ssoCertificate}
          onChange={(e) => setSsoCertificate(e.target.value)}
          rows={4}
          className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--text)]"
        />
        <p className="text-xs text-[var(--text-muted)]">
          Local demo ACS: POST{" "}
          <code className="text-[var(--accent)]">/api/auth/sso</code> with{" "}
          <code className="text-[var(--accent)]">assertion: flux-demo-assertion</code>
          . Or use the{" "}
          <Link href="/sso" className="text-[var(--accent)]">
            SSO sign-in page
          </Link>
          .
        </p>
      </section>

      <Button type="submit">Save</Button>
      {msg ? <p className="text-xs text-[var(--text-muted)]">{msg}</p> : null}
    </form>
  );
}
