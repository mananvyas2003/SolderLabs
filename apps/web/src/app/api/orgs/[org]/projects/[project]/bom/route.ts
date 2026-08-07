import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  blameAllBomLines,
  reconcileBom,
  type DesignSnapshot,
} from "@solderlab/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";

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
  const revId = url.searchParams.get("rev");
  const db = getDb();
  const revs = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selected =
    (revId ? revs.find((r) => r.id === revId) : undefined) ??
    [...revs].reverse()[0];

  const platform = db.bomPlatformLines.filter((p) => p.projectId === project.id);
  let drift = null as ReturnType<typeof reconcileBom> | null;
  if (selected) {
    const snapRow = db.designSnapshots.find((s) => s.revisionId === selected.id);
    if (snapRow) {
      const snap = JSON.parse(snapRow.dataJson) as DesignSnapshot;
      drift = reconcileBom(
        snap.components,
        platform.map((p) => ({
          uuid: p.uuid ?? undefined,
          refdes: p.refdes,
          mpn: p.mpn,
          lockedValue: p.lockedValue,
          lockedFootprint: p.lockedFootprint,
          dnp: p.dnp,
          notes: p.notes,
        })),
      );
    }
  }

  const historyInput = revs.map((r) => {
    const snapRow = db.designSnapshots.find((s) => s.revisionId === r.id);
    let lines: Array<{
      refdes: string;
      uuid?: string;
      value: string;
      footprint: string;
      mpn?: string | null;
      manufacturer?: string | null;
    }> = db.bomLines
      .filter((l) => l.revisionId === r.id)
      .map((l) => ({
        refdes: l.refdes,
        value: l.value,
        footprint: l.footprint,
        mpn: l.mpn,
        manufacturer: l.manufacturer,
      }));
    if (snapRow) {
      try {
        const snap = JSON.parse(snapRow.dataJson) as DesignSnapshot;
        const byRef = new Map(snap.components.map((c) => [c.refdes, c]));
        lines = lines.map((l) => ({
          ...l,
          uuid: byRef.get(l.refdes)?.uuid,
        }));
      } catch {
        /* ignore */
      }
    }
    const author = db.users.find((u) => u.id === r.authorId);
    const review = db.designReviews.find(
      (dr) =>
        dr.projectId === project.id &&
        (dr.headRevisionId === r.id || dr.baseRevisionId === r.id),
    );
    return {
      revisionId: r.id,
      createdAt: r.createdAt,
      authorId: r.authorId,
      authorName: author?.name,
      message: r.message,
      reviewId: review?.id ?? null,
      lines,
    };
  });
  const blameMap = blameAllBomLines(historyInput);
  const blame: Record<string, unknown> = {};
  for (const [k, v] of blameMap) blame[k] = v;

  return NextResponse.json({
    revisionId: selected?.id ?? null,
    platform,
    drift,
    blame,
    lines: selected
      ? db.bomLines.filter((l) => l.revisionId === selected.id)
      : [],
  });
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
  if (!can(membership.role, "bom.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    refdes: string;
    uuid?: string;
    mpn?: string | null;
    manufacturer?: string | null;
    alternateMpns?: string[];
    dnp?: boolean;
    notes?: string | null;
    lockedValue?: string | null;
    lockedFootprint?: string | null;
  };
  if (!body.refdes) {
    return NextResponse.json({ error: "refdes required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.bomPlatformLines.find(
    (p) =>
      p.projectId === project.id &&
      ((body.uuid && p.uuid === body.uuid) || p.refdes === body.refdes),
  );
  const now = nowIso();
  if (existing) {
    existing.mpn = body.mpn !== undefined ? body.mpn ?? null : existing.mpn;
    existing.manufacturer =
      body.manufacturer !== undefined
        ? body.manufacturer ?? null
        : existing.manufacturer;
    existing.dnp = body.dnp ?? existing.dnp;
    existing.notes =
      body.notes !== undefined ? body.notes ?? null : existing.notes;
    if (body.alternateMpns) {
      existing.alternateMpnsJson = JSON.stringify(body.alternateMpns);
    }
    if (body.lockedValue !== undefined) existing.lockedValue = body.lockedValue;
    if (body.lockedFootprint !== undefined) {
      existing.lockedFootprint = body.lockedFootprint;
    }
    if (body.uuid) existing.uuid = body.uuid;
    existing.updatedAt = now;
    existing.updatedBy = user.id;
    persist();
    return NextResponse.json({ id: existing.id });
  }

  const id = nanoid();
  db.bomPlatformLines.push({
    id,
    projectId: project.id,
    uuid: body.uuid ?? null,
    refdes: body.refdes,
    mpn: body.mpn ?? null,
    manufacturer: body.manufacturer ?? null,
    alternateMpnsJson: body.alternateMpns
      ? JSON.stringify(body.alternateMpns)
      : null,
    dnp: body.dnp ?? false,
    notes: body.notes ?? null,
    lockedValue: body.lockedValue ?? null,
    lockedFootprint: body.lockedFootprint ?? null,
    updatedAt: now,
    updatedBy: user.id,
  });
  persist();
  return NextResponse.json({ id });
}
