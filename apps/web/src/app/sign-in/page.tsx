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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-0)] px-6">
      <div className="w-full max-w-[360px]">
        <BrandMark className="mb-8" />
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-sm)]">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            Demo:{" "}
            <span className="font-mono text-[13px] text-[var(--text)]">
              demo@solderlab.dev
            </span>{" "}
            /{" "}
            <span className="font-mono text-[13px] text-[var(--text)]">demo</span>
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Email
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
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
