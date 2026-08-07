import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { readStorage } from "@/lib/storage";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: Request,
  ctx: {
    params: Promise<{ org: string; project: string; releaseId: string }>;
  },
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
  const artifacts = db.releaseArtifacts.filter((a) => a.releaseId === releaseId);
  const downloads = db.downloadAudits.filter((d) => d.releaseId === releaseId);
  return NextResponse.json({ release, artifacts, downloads });
}

export async function POST(
  req: Request,
  ctx: {
    params: Promise<{ org: string; project: string; releaseId: string }>;
  },
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
  if (!can(membership.role, "release.download")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { action?: "download" };
  if (body.action !== "download") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const db = getDb();
  const release = db.releases.find(
    (r) => r.id === releaseId && r.projectId === project.id,
  );
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pkg = db.releaseArtifacts.find(
    (a) => a.releaseId === releaseId && a.path === "manufacturing.zip",
  );
  if (!pkg) return NextResponse.json({ error: "Package missing" }, { status: 404 });

  db.downloadAudits.push({
    id: nanoid(),
    releaseId,
    userId: user.id,
    createdAt: nowIso(),
  });
  persist();
  logActivity({
    orgId: org.id,
    projectId: project.id,
    actorId: user.id,
    action: "release.downloaded",
    summary: `Downloaded ${release.tag}`,
    meta: { releaseId },
  });

  const buf = readStorage(pkg.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${release.tag}-manufacturing.zip"`,
      "X-SolderLab-SHA256": pkg.sha256,
    },
  });
}
