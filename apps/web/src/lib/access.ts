import { getDb } from "@flux/db";
import { ensureDb } from "@/lib/ensure-db";

ensureDb();

export function getOrgBySlug(slug: string) {
  return getDb().organizations.find((o) => o.slug === slug);
}

export function getMembership(orgId: string, userId: string) {
  return getDb().memberships.find(
    (m) => m.orgId === orgId && m.userId === userId,
  );
}

export function getProject(orgId: string, projectSlug: string) {
  return getDb().projects.find(
    (p) => p.orgId === orgId && p.slug === projectSlug,
  );
}

export function getMainBranch(projectId: string) {
  return getDb().branches.find(
    (b) => b.projectId === projectId && b.name === "main",
  );
}

export function assertOrgAccess(orgSlug: string, userId: string) {
  const org = getOrgBySlug(orgSlug);
  if (!org) return { error: "ORG_NOT_FOUND" as const };
  const mem = getMembership(org.id, userId);
  if (!mem) return { error: "FORBIDDEN" as const };
  return { org, membership: mem };
}
