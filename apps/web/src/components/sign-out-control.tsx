"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SignOutControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function signOut() {
    if (busy || pending) return;
    setBusy(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      startTransition(() => {
        router.push("/sign-in");
        router.refresh();
      });
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy || pending}
      className="rounded-[var(--radius-sm)] px-2.5 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
    >
      {busy || pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
