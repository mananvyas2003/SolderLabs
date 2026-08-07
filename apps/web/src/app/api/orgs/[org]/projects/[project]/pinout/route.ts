import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import type { DesignSnapshot } from "@solderlab/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import {
  syncPinoutFromSnapshot,
  pinoutToHeader,
  diffPinouts,
  type PinoutDocument,
} from "@/lib/pinout";
import { logActivity } from "@/lib/activity";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const revisionId = url.searchParams.get("revisionId");
  const compare = url.searchParams.get("compare");
  const target = url.searchParams.get("target") ?? "U1";
  const format = url.searchParams.get("format");

  const db = getDb();
  let pinouts = db.firmwarePinouts.filter((p) => p.projectId === project.id);
  if (revisionId) {
    pinouts = pinouts.filter((p) => p.revisionId === revisionId);
  }

  if (format === "h" && pinouts[0]) {
    const doc = JSON.parse(pinouts[0].dataJson) as PinoutDocument;
    return new NextResponse(pinoutToHeader(doc), {
      headers: {
        "Content-Type": "text/x-c",
        "Content-Disposition": `attachment; filename="${doc.targetRefdes}_pinout.h"`,
      },
    });
  }

  let diff = null;
  if (revisionId && compare) {
    const a = db.firmwarePinouts.find(
      (p) =>
        p.projectId === project.id &&
        p.revisionId === compare &&
        p.targetRefdes.toUpperCase() === target.toUpperCase(),
    );
    const b = db.firmwarePinouts.find(
      (p) =>
        p.projectId === project.id &&
        p.revisionId === revisionId &&
        p.targetRefdes.toUpperCase() === target.toUpperCase(),
    );
    diff = diffPinouts(
      a ? (JSON.parse(a.dataJson) as PinoutDocument) : null,
      b ? (JSON.parse(b.dataJson) as PinoutDocument) : null,
    );
  }

  return NextResponse.json({ pinouts, diff, target });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "revision.upload")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    revisionId?: string;
    targetRefdes?: string;
  };
  if (!body.revisionId || !body.targetRefdes) {
    return NextResponse.json(
      { error: "revisionId and targetRefdes required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const snap = db.designSnapshots.find((s) => s.revisionId === body.revisionId);
  if (!snap) {
    return NextResponse.json({ error: "Snapshot missing" }, { status: 404 });
  }
  const snapshot = JSON.parse(snap.dataJson) as DesignSnapshot;
  const doc = syncPinoutFromSnapshot(snapshot, body.targetRefdes);
  if (!doc) {
    return NextResponse.json(
      { error: `Component ${body.targetRefdes} not found in snapshot` },
      { status: 404 },
    );
  }

  const existing = db.firmwarePinouts.find(
    (p) =>
      p.projectId === project.id &&
      p.revisionId === body.revisionId &&
      p.targetRefdes.toUpperCase() === body.targetRefdes!.toUpperCase(),
  );
  const now = nowIso();
  if (existing) {
    existing.dataJson = JSON.stringify(doc);
    existing.source = "schematic-sync";
    existing.updatedAt = now;
  } else {
    db.firmwarePinouts.push({
      id: nanoid(),
      projectId: project.id,
      revisionId: body.revisionId,
      targetRefdes: doc.targetRefdes,
      dataJson: JSON.stringify(doc),
      source: "schematic-sync",
      createdAt: now,
      updatedAt: now,
    });
  }
  persist();

  logActivity({
    orgId: org.id,
    projectId: project.id,
    actorId: user.id,
    action: "pinout.synced",
    summary: `Synced pinout for ${doc.targetRefdes}`,
    meta: { revisionId: body.revisionId, pins: doc.pins.length },
  });

  return NextResponse.json({
    pinout: doc,
    header: pinoutToHeader(doc),
  });
}
