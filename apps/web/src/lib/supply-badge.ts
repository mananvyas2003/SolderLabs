import type { PartWatch, SolderLabDb } from "@solderlab/db";

const WATCH_STALE_MAX_AGE_MS = 36 * 3600 * 1000;

function watchIsStale(watch: PartWatch, nowMs: number): boolean {
  if (watch.lifecycleStatus === "unknown") return true;
  if (!watch.lastCheckedAt) return true;
  return nowMs - new Date(watch.lastCheckedAt).getTime() > WATCH_STALE_MAX_AGE_MS;
}

export type SupplyBadgeLevel = "critical" | "warning" | "unknown" | "ok";

export type SupplyBadge = {
  level: SupplyBadgeLevel;
  label: string;
  lastCheckedAt: string | null;
};

function oldestCheck(watches: PartWatch[]): string | null {
  const times = watches
    .map((w) => w.lastCheckedAt)
    .filter((t): t is string => Boolean(t))
    .sort();
  return times[0] ?? null;
}

export function projectSupplyBadge(
  db: SolderLabDb,
  orgId: string,
  projectId: string,
  nowMs = Date.now(),
): SupplyBadge {
  const alerts = db.partAlerts.filter(
    (a) =>
      a.orgId === orgId &&
      !a.acknowledgedBy &&
      a.affectedProjects.includes(projectId),
  );
  const watches = db.partWatches.filter(
    (w) => w.orgId === orgId && w.usedIn.includes(projectId),
  );
  const lastCheckedAt = oldestCheck(watches);

  if (alerts.some((a) => a.severity === "critical")) {
    return { level: "critical", label: "EOL / NRND", lastCheckedAt };
  }
  if (alerts.some((a) => a.severity === "warning")) {
    return { level: "warning", label: "Supply risk", lastCheckedAt };
  }
  if (
    !watches.length ||
    watches.some(
      (w) =>
        w.lifecycleStatus === "unknown" ||
        watchIsStale(w, nowMs) ||
        w.lifecycleStatus !== "active",
    )
  ) {
    return { level: "unknown", label: "Unknown / stale", lastCheckedAt };
  }
  return { level: "ok", label: "Active", lastCheckedAt };
}

export function supplyBadgeClass(level: SupplyBadgeLevel): string {
  if (level === "critical") return "bg-red-950/60 text-red-200 border-red-800";
  if (level === "warning") return "bg-amber-950/50 text-amber-200 border-amber-800";
  if (level === "unknown") return "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]";
  return "bg-emerald-950/40 text-emerald-200 border-emerald-800";
}
