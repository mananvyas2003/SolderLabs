export default function ProjectLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-5 w-40 rounded bg-[var(--surface-2)]" />
      <div className="h-24 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]" />
      <div className="h-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]" />
    </div>
  );
}
