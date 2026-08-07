import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <BrandMark />
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-[var(--accent)]"
          >
            Sign in
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Full requirements live in repo{" "}
          <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[13px]">
            PRD.md
          </code>
          .
        </p>
        <ol className="mt-8 space-y-3 border-l-2 border-[var(--border)] pl-5 text-sm leading-relaxed text-[var(--text-muted)]">
          <li>
            Sign in with{" "}
            <span className="font-mono text-[var(--text)]">demo@solderlab.dev</span>{" "}
            / <span className="font-mono text-[var(--text)]">demo</span>
          </li>
          <li>
            Open <span className="font-mono text-[var(--text)]">solderlab</span> →{" "}
            <span className="font-mono text-[var(--text)]">blinky</span>
          </li>
          <li>Use the project tabs: Files, BOM, Reviews, Releases…</li>
          <li>Click <strong className="font-semibold text-[var(--text)]">Compare latest</strong> to diff revisions</li>
        </ol>
        <Link
          href="/app"
          className="mt-10 inline-flex rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
        >
          Open app
        </Link>
      </div>
    </div>
  );
}
