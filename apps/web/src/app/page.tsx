"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/brand-mark";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-soft)]">
      <header className="sl-glass fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[var(--border)] px-4 md:px-16">
        <div className="flex items-center gap-8">
          <BrandMark />
          <nav className="hidden items-center gap-6 text-sm text-[var(--text-muted)] md:flex">
            <Link href="/docs" className="hover:text-[var(--accent-2)]">
              Docs
            </Link>
            <Link href="/app" className="hover:text-[var(--accent-2)]">
              App
            </Link>
          </nav>
        </div>
        <Link
          href="/sign-in"
          className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-24 px-4 pb-24 pt-32 md:px-16">
        <section className="relative mx-auto flex max-w-3xl flex-col items-center py-16 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(94,92,230,0.12),transparent_65%)]" />
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1">
            <span className="sl-pulse-dot h-2 w-2 rounded-full bg-[var(--accent-2)]" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-2)]">
              Review live
            </span>
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--text)] md:text-6xl md:tracking-[-0.02em]">
            SolderLab
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl">
            Version, review, and release boards — with evidence-linked review that
            understands your schematic, not just filenames.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] px-8 py-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
            >
              Start building
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--border)] px-8 py-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]"
            >
              Read docs
            </Link>
          </div>
          <p className="mt-12 font-mono text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
            demo@solderlab.dev / demo
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Schematic-aware diff",
              body: "Compare revisions by nets, components, and BOM — not binary blobs.",
            },
            {
              title: "SolderLab Review",
              body: "Risks and suggested actions grounded in the Design Context Graph.",
            },
            {
              title: "Release with evidence",
              body: "Ship manufacturing packages with checks, history, and share links.",
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              className="sl-bento"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.4 }}
            >
              <h2 className="text-lg font-medium tracking-tight text-[var(--text)]">
                {card.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                {card.body}
              </p>
            </motion.div>
          ))}
        </section>

        <motion.section
          className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45 }}
        >
          <div className="relative h-[280px] md:h-[340px]">
            <BoardDiffVisual />
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 font-mono text-[11px] text-[var(--text-subtle)]">
            <span>rev…a3f2 → rev…c91b</span>
            <span className="text-[var(--accent-2)]">schematic diff</span>
          </div>
        </motion.section>
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
        className="absolute left-[12%] top-[18%] h-[46%] w-[52%] border border-[var(--diff-del-fg)]/25 bg-[var(--diff-del)]"
        animate={{ opacity: [0.5, 0.22, 0.5] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[30%] top-[28%] h-[46%] w-[52%] border border-[var(--diff-add-fg)]/25 bg-[var(--diff-add)]"
        animate={{ opacity: [0.3, 0.68, 0.3] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 280">
        <path
          d="M48 200 H120 V80 H205 V140 H320"
          fill="none"
          stroke="var(--accent-2)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="120" cy="80" r="3.5" fill="var(--accent-2)" />
        <circle cx="205" cy="140" r="3.5" fill="var(--accent-2)" />
      </svg>
    </div>
  );
}
