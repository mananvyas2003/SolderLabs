import { NextResponse } from "next/server";
import { getDb, persist } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "org.invite")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as {
    requireGreenChecks?: boolean;
    requireApproval?: boolean;
  };
  const row = getDb().projects.find((p) => p.id === project.id)!;
  if (typeof body.requireGreenChecks === "boolean") {
    row.requireGreenChecks = body.requireGreenChecks;
  }
  if (typeof body.requireApproval === "boolean") {
    row.requireApproval = body.requireApproval;
  }
  persist();
  return NextResponse.json({ ok: true });
}
