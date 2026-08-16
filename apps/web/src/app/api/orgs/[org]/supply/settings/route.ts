import { NextResponse } from "next/server";
import { getDb, persist } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

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
    leadTimeWeeksThreshold?: number;
    buildQty?: number;
    priceChangePercent?: number;
    volumeTierQty?: number;
  };
  const db = getDb();
  let row = db.orgSupplySettings.find((s) => s.orgId === org.id);
  if (!row) {
    row = {
      id: org.id,
      orgId: org.id,
      leadTimeWeeksThreshold: 16,
      buildQty: 100,
      priceChangePercent: 15,
      volumeTierQty: 100,
    };
    db.orgSupplySettings.push(row);
  }
  if (typeof body.leadTimeWeeksThreshold === "number") {
    row.leadTimeWeeksThreshold = body.leadTimeWeeksThreshold;
  }
  if (typeof body.buildQty === "number") row.buildQty = body.buildQty;
  if (typeof body.priceChangePercent === "number") {
    row.priceChangePercent = body.priceChangePercent;
  }
  if (typeof body.volumeTierQty === "number") row.volumeTierQty = body.volumeTierQty;
  persist();
  return NextResponse.json({ settings: row });
}
