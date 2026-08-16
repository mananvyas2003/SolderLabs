import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-soft)]">
      <header className="sl-glass flex h-16 items-center justify-between border-b border-[var(--border)] px-4 md:px-16">
        <BrandMark />
        <Link
          href="/sign-in"
          className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-2)]"
        >
          Sign in
        </Link>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-2xl font-medium tracking-tight text-[var(--text)]">
          Docs
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Full requirements live in repo{" "}
          <code className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--accent-2)]">
            PRD.md
          </code>
          .
        </p>
        <ol className="mt-8 space-y-3 border-l border-[var(--border)] pl-5 text-sm leading-relaxed text-[var(--text-muted)]">
          <li>
            Sign in with{" "}
            <span className="font-mono text-[var(--text)]">demo@solderlab.dev</span>{" "}
            / <span className="font-mono text-[var(--text)]">demo</span>
          </li>
          <li>
            Open <span className="font-mono text-[var(--text)]">solderlab</span> →{" "}
            <span className="font-mono text-[var(--text)]">blinky</span>
          </li>
          <li>Use project tabs and the Review rail for AI suggestions</li>
          <li>Upload a `.zip` or `.kicad_sch`, then Compare latest</li>
        </ol>
        <Link
          href="/app"
          className="mt-10 inline-flex rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
        >
          Open app
        </Link>
      </div>
    </div>
  );
}
