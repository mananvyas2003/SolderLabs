"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/brand-mark";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <BrandMark />
        <nav className="flex items-center gap-5 text-sm text-[var(--text-muted)]">
          <Link href="/docs" className="hover:text-[var(--text)]">
            Docs
          </Link>
          <Link
            href="/sign-in"
            className="rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid max-w-5xl items-center gap-12 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
        <div className="space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text)] md:text-[2.75rem] md:leading-[1.1]">
            SolderLab
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[var(--text-muted)]">
            Version, review, and release boards — review that understands your
            schematic, not just your filenames.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link
              href="/sign-in"
              className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
            >
              Start free
            </Link>
            <Link
              href="/app"
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              Open app
            </Link>
          </div>
        </div>

        <motion.div
          className="relative h-[320px] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-sm)] md:h-[380px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <BoardDiffVisual />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[11px] text-[var(--text-subtle)]">
            <span>rev…a3f2 → rev…c91b</span>
            <span className="text-[var(--accent)]">schematic diff</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function BoardDiffVisual() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-muted) 1px, transparent 1px), linear-gradient(90deg, var(--border-muted) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <motion.div
        className="absolute left-[12%] top-[18%] h-[46%] w-[54%] border border-[var(--diff-del-fg)]/20 bg-[var(--diff-del)]"
        animate={{ opacity: [0.55, 0.25, 0.55] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[30%] top-[28%] h-[46%] w-[54%] border border-[var(--diff-add-fg)]/20 bg-[var(--diff-add)]"
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300">
        <path
          d="M48 210 H118 V90 H200 V150 H310"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="118" cy="90" r="3.5" fill="var(--accent)" />
        <circle cx="200" cy="150" r="3.5" fill="var(--accent)" />
      </svg>
    </div>
  );
}
