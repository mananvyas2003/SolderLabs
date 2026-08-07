import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <BrandMark />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Product requirements live in the repo root{" "}
          <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--text)]">
            PRD.md
          </code>
          .
        </p>
        <ol className="mt-8 list-decimal space-y-2.5 border-l border-[var(--border)] pl-5 text-sm leading-relaxed text-[var(--text-muted)]">
          <li>
            Sign in with{" "}
            <span className="font-mono text-[var(--text)]">demo@solderlab.dev</span> /{" "}
            <span className="font-mono text-[var(--text)]">demo</span>
          </li>
          <li>
            Open org <span className="font-mono text-[var(--text)]">solderlab</span> →
            project <span className="font-mono text-[var(--text)]">blinky</span>
          </li>
          <li>Seed fixtures or upload a KiCad zip</li>
          <li>Compare revisions, open a Design Review, run Review /summarize</li>
        </ol>
        <Link
          href="/app"
          className="mt-10 inline-block text-sm text-[var(--accent)] hover:underline"
        >
          Open app →
        </Link>
      </div>
    </div>
  );
}
