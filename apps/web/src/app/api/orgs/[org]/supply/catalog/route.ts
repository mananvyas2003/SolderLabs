import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { parsePartCsv, parseLifecycle } from "@solderlab/parts";
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
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const text = await file.text();
  const rows = parsePartCsv(text);
  const db = getDb();
  const now = nowIso();
  for (const row of rows) {
    const life = parseLifecycle(row.lifecycleStatus) ?? "unknown";
    const existing = db.manualPartCatalog.find(
      (c) => c.orgId === org.id && c.mpn.toUpperCase() === row.mpn.toUpperCase(),
    );
    if (existing) {
      existing.manufacturer = row.manufacturer ?? null;
      existing.lifecycleStatus = life;
      existing.lastTimeBuyDate = row.lastTimeBuyDate ?? null;
      existing.leadTimeWeeks = row.leadTimeWeeks ?? null;
      existing.stockTotal = row.stockTotal ?? null;
      existing.priceBreaks = row.priceBreaks ?? [];
      existing.updatedAt = now;
    } else {
      db.manualPartCatalog.push({
        id: nanoid(),
        orgId: org.id,
        mpn: row.mpn,
        manufacturer: row.manufacturer ?? null,
        lifecycleStatus: life,
        lastTimeBuyDate: row.lastTimeBuyDate ?? null,
        leadTimeWeeks: row.leadTimeWeeks ?? null,
        stockTotal: row.stockTotal ?? null,
        priceBreaks: row.priceBreaks ?? [],
        updatedAt: now,
      });
    }
  }
  persist();
  return NextResponse.json({ rows: rows.length });
}
