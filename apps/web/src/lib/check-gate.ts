import { getDb } from "@solderlab/db";

export const DECLARED_REQUIRED_CHECKS = [
  "bom-mpn",
  "connectivity-gate",
  "unintended-connectivity",
  "bom-lifecycle",
] as const;

export function revisionChecksPassing(projectId: string, revisionId: string) {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  const checks = db.checkRuns.filter((c) => c.revisionId === revisionId);
  const declaredRequired = [...DECLARED_REQUIRED_CHECKS];
  const blockingStatus = new Set(["fail", "error", "pending", "running"]);

  const failing = checks.filter((c) => blockingStatus.has(c.status));
  const missing = declaredRequired.filter((name) => !checks.some((c) => c.name === name));
  const missingAsFails = missing.map((name) => ({
    name,
    summary: `Required check never ran: ${name}`,
    status: "missing",
  }));

  if (project?.requireGreenChecks && (failing.length || missing.length)) {
    return {
      ok: false as const,
      failing: [
        ...failing,
        ...missingAsFails.map((m) => ({
          name: m.name,
          summary: m.summary,
          status: m.status,
        })),
      ],
      required: declaredRequired,
    };
  }
  return { ok: true as const, failing: [], required: declaredRequired };
}
