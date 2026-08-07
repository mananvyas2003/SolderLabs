import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ org: string; project: string; releaseId: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug, releaseId } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const release = db.releases.find(
    (r) => r.id === releaseId && r.projectId === project.id,
  );
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const shares = db.releaseShares.filter((s) => s.releaseId === releaseId);
  return NextResponse.json({ shares });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string; releaseId: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug, releaseId } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "release.share")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const release = db.releases.find(
    (r) => r.id === releaseId && r.projectId === project.id,
  );
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    label?: string;
    days?: number;
    allowGerbers?: boolean;
    allowBom?: boolean;
    watermark?: string;
  };

  const token = randomBytes(18).toString("base64url");
  const days = Math.min(Math.max(body.days ?? 14, 1), 90);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const id = nanoid();
  db.releaseShares.push({
    id,
    releaseId,
    token,
    label: body.label?.trim() || "CM / fab share",
    allowGerbers: body.allowGerbers !== false,
    allowBom: body.allowBom !== false,
    allowCad: false,
    watermark: body.watermark?.trim() || `${org.slug}/${project.slug}@${release.tag}`,
    expiresAt,
    createdBy: user.id,
    createdAt: nowIso(),
    revokedAt: null,
  });
  db.releaseShareAudits.push({
    id: nanoid(),
    shareId: id,
    action: "created",
    metaJson: JSON.stringify({ by: user.id }),
    createdAt: nowIso(),
  });
  persist();

  return NextResponse.json({
    id,
    token,
    expiresAt,
    path: `/share/${token}`,
  });
}
