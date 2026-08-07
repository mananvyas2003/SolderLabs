import { NextResponse } from "next/server";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const url = new URL(req.url);
  const revisionId = url.searchParams.get("revisionId");
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let checks = getDb().checkRuns.filter((c) => c.projectId === project.id);
  if (revisionId) checks = checks.filter((c) => c.revisionId === revisionId);
  checks = checks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({
    checks,
    settings: {
      requireGreenChecks: project.requireGreenChecks,
      requireApproval: project.requireApproval,
    },
  });
}
