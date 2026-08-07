import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  attachPcbToDiff,
  diffSnapshots,
  type DesignSnapshot,
  type PcbSnapshot,
} from "@solderlab/design-core";
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
  const cached = db.diffBundles.find(
    (d) =>
      d.projectId === project.id &&
      d.baseRevisionId === base &&
      d.headRevisionId === head,
  );
  if (cached) {
    return NextResponse.json({
      id: cached.id,
      data: JSON.parse(cached.dataJson),
    });
  }

  const baseSnap = db.designSnapshots.find((s) => s.revisionId === base);
  const headSnap = db.designSnapshots.find((s) => s.revisionId === head);
  if (!baseSnap || !headSnap) {
    return NextResponse.json(
      { error: "Snapshots missing — parse may have failed" },
      { status: 404 },
    );
  }

  let data = diffSnapshots(
    JSON.parse(baseSnap.dataJson) as DesignSnapshot,
    JSON.parse(headSnap.dataJson) as DesignSnapshot,
    { baseRevisionId: base, headRevisionId: head },
  );

  const basePcb = db.pcbSnapshots.find((s) => s.revisionId === base);
  const headPcb = db.pcbSnapshots.find((s) => s.revisionId === head);
  data = attachPcbToDiff(
    data,
    basePcb ? (JSON.parse(basePcb.dataJson) as PcbSnapshot) : null,
    headPcb ? (JSON.parse(headPcb.dataJson) as PcbSnapshot) : null,
  );

  const id = nanoid();
  db.diffBundles.push({
    id,
    projectId: project.id,
    baseRevisionId: base,
    headRevisionId: head,
    dataJson: JSON.stringify(data),
    createdAt: nowIso(),
  });
  persist();

  return NextResponse.json({ id, data });
}
