"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/brand-mark";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <BrandMark />
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/docs"
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Docs
            </Link>
            <Link
              href="/sign-in"
              className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid items-center gap-10 pb-16 pt-14 md:grid-cols-[1.05fr_0.95fr] md:pt-20">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">
              Hardware collaboration
            </p>
            <h1 className="mt-3 max-w-lg text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--text)] md:text-5xl">
              SolderLab
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-[var(--text-muted)]">
              Version boards, review schematics with evidence, and ship releases
              your CM can trust.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-in"
                className="inline-flex rounded-[var(--radius)] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
              >
                Sign in to continue
              </Link>
              <Link
                href="/docs"
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Read the docs →
              </Link>
            </div>
          </div>

          <motion.div
            className="relative h-[300px] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] md:h-[340px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <BoardDiffVisual />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--text-subtle)]">
              <span>a3f2 → c91b</span>
              <span className="font-sans text-[var(--accent)]">schematic diff</span>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

function BoardDiffVisual() {
  return (
    <div className="absolute inset-0 bottom-9">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-muted) 1px, transparent 1px), linear-gradient(90deg, var(--border-muted) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <motion.div
        className="absolute left-[12%] top-[16%] h-[48%] w-[52%] border border-[var(--diff-del-fg)]/15 bg-[var(--diff-del)]"
        animate={{ opacity: [0.5, 0.22, 0.5] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[30%] top-[26%] h-[48%] w-[52%] border border-[var(--diff-add-fg)]/15 bg-[var(--diff-add)]"
        animate={{ opacity: [0.3, 0.68, 0.3] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 280">
        <path
          d="M48 200 H120 V80 H205 V140 H320"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="120" cy="80" r="3.5" fill="var(--accent)" />
        <circle cx="205" cy="140" r="3.5" fill="var(--accent)" />
      </svg>
    </div>
  );
}
