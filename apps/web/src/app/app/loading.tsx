export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-7 w-48 rounded bg-[var(--surface-2)]" />
      <div className="h-16 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]" />
      <div className="h-16 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]" />
    </div>
  );
}
