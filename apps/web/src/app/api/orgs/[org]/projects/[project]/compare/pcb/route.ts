import { NextResponse } from "next/server";
import { getDb } from "@solderlab/db";
import type { PcbSnapshot } from "@solderlab/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const url = new URL(req.url);
  const base = url.searchParams.get("base");
  const head = url.searchParams.get("head");
  if (!base || !head) {
    return NextResponse.json({ error: "base and head required" }, { status: 400 });
  }

  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const basePcb = db.pcbSnapshots.find((s) => s.revisionId === base);
  const headPcb = db.pcbSnapshots.find((s) => s.revisionId === head);
  return NextResponse.json({
    pcbBase: basePcb ? (JSON.parse(basePcb.dataJson) as PcbSnapshot) : null,
    pcbHead: headPcb ? (JSON.parse(headPcb.dataJson) as PcbSnapshot) : null,
  });
}
