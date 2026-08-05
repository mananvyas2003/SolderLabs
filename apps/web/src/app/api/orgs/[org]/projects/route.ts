import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ org: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json(
      { error: access.error },
      { status: access.error === "FORBIDDEN" ? 403 : 404 },
    );
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const list = getDb().projects.filter((p) => p.orgId === org.id);
  return NextResponse.json({ org, projects: list });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const body = (await req.json()) as {
    name?: string;
    slug?: string;
    description?: string;
  };
  if (!body.name || !body.slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }
  const db = getDb();
  const id = nanoid();
  const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  db.projects.push({
    id,
    orgId: org.id,
    name: body.name,
    slug,
    description: body.description ?? null,
    visibility: "private",
    defaultBranch: "main",
    requireGreenChecks: true,
    requireApproval: false,
    starCount: 0,
    createdAt: nowIso(),
  });
  db.branches.push({
    id: nanoid(),
    projectId: id,
    name: "main",
    headRevisionId: null,
  });
  persist();
  return NextResponse.json({ id, slug, name: body.name });
}
