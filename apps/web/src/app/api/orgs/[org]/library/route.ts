import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

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
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const parts = getDb().libraryParts.filter((p) => p.orgId === org.id);
  return NextResponse.json({ parts });
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
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "library.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    mpn?: string;
    manufacturer?: string;
    footprint?: string;
    status?: string;
    notes?: string;
    alternates?: string[];
  };
  if (!body.mpn) {
    return NextResponse.json({ error: "mpn required" }, { status: 400 });
  }
  const id = nanoid();
  getDb().libraryParts.push({
    id,
    orgId: org.id,
    mpn: body.mpn,
    manufacturer: body.manufacturer ?? null,
    footprint: body.footprint ?? null,
    status: body.status ?? "approved",
    notes: body.notes ?? null,
    alternatesJson: body.alternates ? JSON.stringify(body.alternates) : null,
    createdAt: nowIso(),
  });
  persist();
  logActivity({
    orgId: org.id,
    actorId: user.id,
    action: "library.part_added",
    summary: `Library part ${body.mpn}`,
    meta: { id, status: body.status ?? "approved" },
  });
  return NextResponse.json({ id });
}

export async function PATCH(
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
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "library.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    id?: string;
    status?: string;
    notes?: string;
    alternates?: string[];
  };
  const part = getDb().libraryParts.find(
    (p) => p.id === body.id && p.orgId === org.id,
  );
  if (!part) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.status) part.status = body.status;
  if (body.notes !== undefined) part.notes = body.notes;
  if (body.alternates) part.alternatesJson = JSON.stringify(body.alternates);
  persist();
  return NextResponse.json({ ok: true });
}
