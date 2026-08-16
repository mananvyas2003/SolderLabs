import type { SolderLabDb } from "@solderlab/db";
import { END_OF_LIFE_STATUSES } from "./types.ts";

export function evaluateBomLifecycle(
  db: SolderLabDb,
  orgId: string,
  revisionId: string,
): { status: "pass" | "fail"; summary: string; details: Record<string, unknown> } {
  const mpns = [
    ...new Set(
      db.bomLines
        .filter((l) => l.revisionId === revisionId && l.mpn && l.mpn.trim())
        .map((l) => l.mpn!.trim()),
    ),
  ];
  if (!mpns.length) {
    return {
      status: "pass",
      summary: "No MPNs on this revision to watch",
      details: { mpns: [] },
    };
  }

  const critical = db.partAlerts.filter(
    (a) =>
      a.orgId === orgId &&
      !a.acknowledgedBy &&
      a.severity === "critical" &&
      mpns.some((m) => m.toUpperCase() === a.mpn.toUpperCase()),
  );
  const eolWatches = db.partWatches.filter(
    (w) =>
      w.orgId === orgId &&
      mpns.some((m) => m.toUpperCase() === w.mpn.toUpperCase()) &&
      END_OF_LIFE_STATUSES.has(w.lifecycleStatus),
  );
  if (critical.length || eolWatches.length) {
    const names = [
      ...new Set([
        ...critical.map((a) => a.mpn),
        ...eolWatches.map((w) => w.mpn),
      ]),
    ];
    return {
      status: "fail",
      summary: `Critical lifecycle risk on ${names.join(", ")}`,
      details: {
        alerts: critical.map((a) => a.id),
        mpns: names,
      },
    };
  }

  const unknown = db.partWatches.filter(
    (w) =>
      w.orgId === orgId &&
      mpns.some((m) => m.toUpperCase() === w.mpn.toUpperCase()) &&
      w.lifecycleStatus === "unknown",
  );
  const unchecked = mpns.filter(
    (m) =>
      !db.partWatches.some(
        (w) => w.orgId === orgId && w.mpn.toUpperCase() === m.toUpperCase(),
      ),
  );
  return {
    status: "pass",
    summary:
      unknown.length || unchecked.length
        ? `No critical alerts; ${unknown.length + unchecked.length} MPN(s) lifecycle unknown (not assumed active)`
        : `No critical lifecycle alerts on ${mpns.length} MPN(s)`,
    details: { unknown: unknown.map((w) => w.mpn), unchecked },
  };
}
