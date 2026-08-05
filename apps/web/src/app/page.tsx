"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <span className="text-sm font-semibold tracking-[0.2em] text-[var(--accent)]">
          FLUX
        </span>
        <nav className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          <Link href="/explore" className="hover:text-[var(--text)]">
            Explore
          </Link>
          <Link href="/docs" className="hover:text-[var(--text)]">
            Docs
          </Link>
          <Link href="/sso" className="hover:text-[var(--text)]">
            SSO
          </Link>
          <Link
            href="/sign-in"
            className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[var(--text)] hover:border-[var(--accent)]"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="relative mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl items-center gap-10 px-6 pb-16 pt-6 md:grid-cols-2 md:px-10">
        <div className="relative z-10 space-y-6">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--accent)]">
            GitHub for Hardware
          </p>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            Flux
          </h1>
          <p className="max-w-md text-lg text-[var(--text-muted)]">
            Version, review, and release electronics with AI that understands
            your schematic — not just your filenames.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              className="rounded-[6px] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1208] hover:brightness-110"
            >
              Start free
            </Link>
            <Link
              href="/app"
              className="rounded-[6px] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text)] hover:border-[var(--accent)]"
            >
              Open app
            </Link>
          </div>
        </div>

        <motion.div
          className="relative h-[360px] overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--surface-1)] md:h-[420px]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <BoardDiffVisual />
        </motion.div>
      </main>
    </div>
  );
}

function BoardDiffVisual() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <motion.div
        className="absolute left-[12%] top-[22%] h-[48%] w-[58%] border border-[var(--diff-del)]/60 bg-[color-mix(in_srgb,var(--diff-del)_25%,transparent)]"
        animate={{ opacity: [0.55, 0.2, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[28%] top-[30%] h-[48%] w-[58%] border border-[var(--diff-add)]/70 bg-[color-mix(in_srgb,var(--diff-add)_28%,transparent)]"
        animate={{ opacity: [0.35, 0.75, 0.35] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300">
        <path
          d="M40 220 H120 V80 H210 V160 H320"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <circle cx="120" cy="80" r="5" fill="var(--accent-2)" />
        <circle cx="210" cy="160" r="5" fill="var(--accent-2)" />
        <rect
          x="300"
          y="145"
          width="48"
          height="30"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
      </svg>
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        <span>Schematic overlay · r1 → r2</span>
        <span className="text-[var(--accent)]">Live diff</span>
      </div>
    </div>
  );
}
