"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export default function SsoSignInPage() {
  const router = useRouter();
  const [orgSlug, setOrgSlug] = useState("flux-labs");
  const [email, setEmail] = useState("engineer@acme.com");
  const [name, setName] = useState("SSO Engineer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug,
        email,
        name,
        assertion: "flux-demo-assertion",
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setError(
        j.error ??
          "SSO failed — enable SSO in org enterprise settings first",
      );
      return;
    }
    router.push(`/app/${orgSlug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm tracking-[0.2em] text-[var(--accent)]">
        FLUX
      </Link>
      <h1 className="text-2xl font-semibold">Enterprise SSO</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Demo SAML ACS. Enable SSO on the org, then sign in with a domain email.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Org slug
          </label>
          <Input
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value)}
            className="font-mono"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Work email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Display name
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Validating assertion…" : "Continue with SSO"}
        </Button>
      </form>
      <p className="mt-6 text-xs text-[var(--text-muted)]">
        <Link href="/sign-in" className="text-[var(--accent)]">
          Password sign-in
        </Link>
      </p>
    </div>
  );
}
