import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-[var(--accent)]">
        ← Flux
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Docs</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        Full product requirements live in the repo root{" "}
        <code className="font-mono text-[var(--accent)]">PRD.md</code>.
      </p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm text-[var(--text-muted)]">
        <li>Sign in with demo@flux.dev / demo</li>
        <li>Open org flux-labs → project blinky</li>
        <li>Seed fixtures or upload a KiCad zip</li>
        <li>Compare revisions, open a Design Review, run Copilot /summarize</li>
      </ol>
    </div>
  );
}
