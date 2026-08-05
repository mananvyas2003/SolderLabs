import { NextResponse } from "next/server";
import { getDb, persist } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { DATA_REGIONS } from "@/lib/regions";

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
  return NextResponse.json({
    org,
    role: membership.role,
    regions: DATA_REGIONS,
  });
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
  if (!can(membership.role, "org.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    dataRegion?: string;
    ssoEnabled?: boolean;
    ssoEntityId?: string | null;
    ssoEntryUrl?: string | null;
    ssoCertificate?: string | null;
    ssoDomain?: string | null;
    name?: string;
  };

  const row = getDb().organizations.find((o) => o.id === org.id)!;
  if (body.name) row.name = body.name;
  if (body.dataRegion) {
    const ok = DATA_REGIONS.some((r) => r.id === body.dataRegion);
    if (!ok) {
      return NextResponse.json({ error: "Invalid region" }, { status: 400 });
    }
    row.dataRegion = body.dataRegion;
  }
  if (typeof body.ssoEnabled === "boolean") row.ssoEnabled = body.ssoEnabled;
  if (body.ssoEntityId !== undefined) row.ssoEntityId = body.ssoEntityId;
  if (body.ssoEntryUrl !== undefined) row.ssoEntryUrl = body.ssoEntryUrl;
  if (body.ssoCertificate !== undefined) row.ssoCertificate = body.ssoCertificate;
  if (body.ssoDomain !== undefined) row.ssoDomain = body.ssoDomain;
  persist();

  logActivity({
    orgId: org.id,
    actorId: user.id,
    action: "org.settings_updated",
    summary: "Updated org enterprise settings",
    meta: {
      dataRegion: row.dataRegion,
      ssoEnabled: row.ssoEnabled,
    },
  });

  return NextResponse.json({ org: row });
}
