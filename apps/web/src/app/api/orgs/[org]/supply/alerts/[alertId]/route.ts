import { NextResponse } from "next/server";
import { getDb, persist } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ org: string; alertId: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, alertId } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const alert = getDb().partAlerts.find((a) => a.id === alertId && a.orgId === org.id);
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  alert.acknowledgedBy = user.id;
  persist();
  return NextResponse.json({ alert });
}
