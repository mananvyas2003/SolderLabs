"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@solderlab/ui";
import { BrandMark } from "@/components/brand-mark";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@solderlab.dev");
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
    <div className="flex min-h-screen flex-col bg-[var(--surface-0)]">
      <header className="sl-glass flex h-16 items-center border-b border-[var(--border)] px-4 md:px-16">
        <BrandMark />
      </header>
      <div className="flex flex-1 items-start justify-center px-6 pt-20">
        <div className="w-full max-w-[400px]">
          <h1 className="text-2xl font-medium tracking-tight text-[var(--text)]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Demo:{" "}
            <span className="font-mono text-[13px] text-[var(--accent-2)]">
              demo@solderlab.dev
            </span>{" "}
            / <span className="font-mono text-[13px] text-[var(--accent-2)]">demo</span>
          </p>
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-6"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-widest text-[var(--text-subtle)]">
                Email
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-widest text-[var(--text-subtle)]">
                Password
              </label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                autoComplete="current-password"
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
      </div>
    </div>
  );
}
