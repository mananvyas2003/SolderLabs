"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@flux/ui";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@flux.dev");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Sign in failed");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm tracking-[0.2em] text-[var(--accent)]">
        FLUX
      </Link>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Demo auth for local Phase 0/1. Use{" "}
        <span className="font-mono text-[var(--text)]">demo@flux.dev</span> /{" "}
        <span className="font-mono text-[var(--text)]">demo</span>.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Email
          </label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Password
          </label>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        ) : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
