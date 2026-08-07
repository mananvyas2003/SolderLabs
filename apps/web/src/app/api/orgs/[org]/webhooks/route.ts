import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";

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
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "webhook.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const hooks = getDb().webhooks.filter((w) => w.orgId === org.id);
  return NextResponse.json({ webhooks: hooks });
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
  if (!can(membership.role, "webhook.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    url?: string;
    secret?: string;
    events?: string[];
  };
  if (!body.url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const id = nanoid();
  getDb().webhooks.push({
    id,
    orgId: org.id,
    url: body.url,
    secret: body.secret ?? null,
    events: body.events?.length
      ? body.events
      : [
          "revision.uploaded",
          "review.merged",
          "release.published",
          "library.part_added",
        ],
    active: true,
    createdAt: nowIso(),
  });
  persist();
  return NextResponse.json({ id });
}
