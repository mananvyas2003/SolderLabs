import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject, getMainBranch } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { reviewDto } from "@/lib/review-dto";

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
    .designReviews.filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({
    reviews: list.map((r) => reviewDto(r, getDb())),
  });
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
  const body = (await req.json()) as {
    title?: string;
    body?: string;
    baseRevisionId?: string;
    headRevisionId?: string;
  };
  if (!body.title || !body.baseRevisionId || !body.headRevisionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const db = getDb();
  const number =
    db.designReviews.filter((r) => r.projectId === project.id).length + 1;
  const id = nanoid();
  const branch = getMainBranch(project.id);
  db.designReviews.push({
    id,
    projectId: project.id,
    number,
    title: body.title,
    body: body.body ?? null,
    baseRevisionId: body.baseRevisionId,
    headRevisionId: body.headRevisionId,
    state: "open",
    authorId: user.id,
    targetBranchId: branch?.id ?? null,
    createdAt: nowIso(),
    mergedAt: null,
  });
  persist();
  return NextResponse.json({ id, number });
}
