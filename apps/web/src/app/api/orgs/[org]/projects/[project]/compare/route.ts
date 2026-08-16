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
  const baseRev = db.revisions.find((r) => r.id === base && r.projectId === project.id);
  const headRev = db.revisions.find((r) => r.id === head && r.projectId === project.id);

  if (
    baseRev?.parseStatus === "partial" ||
    headRev?.parseStatus === "partial"
  ) {
    return NextResponse.json(
      {
        error: "Revision is a partial parse and cannot be used as a diff base",
        parseStatus: "partial",
      },
      { status: 409 },
    );
  }

  const cached = db.diffBundles.find(
    (d) =>
      d.projectId === project.id &&
      d.baseRevisionId === base &&
      d.headRevisionId === head,
  );
  const paginate = (data: ReturnType<typeof diffSnapshots>) => {
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 800), 1),
      2000,
    );
    const cOff = Math.max(Number(url.searchParams.get("componentsOffset") ?? 0), 0);
    const nOff = Math.max(Number(url.searchParams.get("netsOffset") ?? 0), 0);
    const componentsTotal = data.components.length;
    const netsTotal = data.nets.length;
    return {
      ...data,
      components: data.components.slice(cOff, cOff + limit),
      nets: data.nets.slice(nOff, nOff + limit),
      page: {
        limit,
        componentsOffset: cOff,
        netsOffset: nOff,
        componentsTotal,
        netsTotal,
        truncated: cOff + limit < componentsTotal || nOff + limit < netsTotal,
      },
    };
  };

  if (cached) {
    return NextResponse.json({
      id: cached.id,
      data: paginate(JSON.parse(cached.dataJson)),
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

  const baseData = JSON.parse(baseSnap.dataJson) as DesignSnapshot;
  const headData = JSON.parse(headSnap.dataJson) as DesignSnapshot;
  const unusable = (snap: DesignSnapshot, parseStatus?: string) =>
    parseStatus === "partial" ||
    snap.parseStatus === "partial" ||
    Boolean(snap.warnings?.some((w) => w.code === "missing-sheet"));
  if (unusable(baseData, baseRev?.parseStatus) || unusable(headData, headRev?.parseStatus)) {
    return NextResponse.json(
      {
        error: "Revision is a partial parse and cannot be used as a diff base",
        parseStatus: "partial",
      },
      { status: 409 },
    );
  }

  let data = diffSnapshots(baseData, headData, {
    baseRevisionId: base,
    headRevisionId: head,
  });

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

  return NextResponse.json({ id, data: paginate(data) });
}
