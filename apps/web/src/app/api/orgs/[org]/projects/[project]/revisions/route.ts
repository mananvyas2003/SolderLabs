import { NextResponse } from "next/server";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject, getMainBranch } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { createRevisionFromZip, normalizeUploadToZip } from "@/lib/revisions";

export async function GET(
  _req: Request,
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
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const list = getDb()
    .revisions.filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ revisions: list });
}

export async function POST(
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
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const branch = getMainBranch(project.id);
  if (!branch) return NextResponse.json({ error: "No main branch" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  const message = String(form.get("message") ?? "Upload revision");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let zipBuffer: Buffer;
  try {
    ({ zipBuffer } = normalizeUploadToZip(file.name, buf));
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Unsupported file type. Upload a .zip or .kicad_sch.",
      },
      { status: 400 },
    );
  }
  const revisionId = await createRevisionFromZip({
    projectId: project.id,
    branchId: branch.id,
    authorId: user.id,
    message,
    zipBuffer,
    parentRevisionId: branch.headRevisionId,
  });
  return NextResponse.json({ revisionId });
}
