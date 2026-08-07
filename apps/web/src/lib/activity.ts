import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { dispatchWebhooks } from "@/lib/webhooks";

export function logActivity(opts: {
  orgId: string;
  projectId?: string | null;
  actorId?: string | null;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  const db = getDb();
  db.activityEvents.unshift({
    id: nanoid(),
    orgId: opts.orgId,
    projectId: opts.projectId ?? null,
    actorId: opts.actorId ?? null,
    action: opts.action,
    summary: opts.summary,
    metaJson: opts.meta ? JSON.stringify(opts.meta) : null,
    createdAt: nowIso(),
  });
  if (db.activityEvents.length > 500) {
    db.activityEvents.length = 500;
  }
  db.auditEvents.unshift({
    id: nanoid(),
    orgId: opts.orgId,
    actorId: opts.actorId ?? null,
    action: opts.action,
    targetType: opts.projectId ? "project" : "org",
    targetId: opts.projectId ?? opts.orgId,
    metaJson: opts.meta ? JSON.stringify(opts.meta) : null,
    createdAt: nowIso(),
  });
  persist();
  void dispatchWebhooks(opts.orgId, opts.action, {
    summary: opts.summary,
    projectId: opts.projectId,
    ...opts.meta,
  });
}
