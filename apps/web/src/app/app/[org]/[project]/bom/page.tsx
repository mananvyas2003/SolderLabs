import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import {
  blameAllBomLines,
  reconcileBom,
  type DesignSnapshot,
} from "@solderlab/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { BomClient } from "@/components/bom-client";

export default async function BomPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const { rev } = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const db = getDb();
  const revsAsc = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const revsDesc = [...revsAsc].reverse();
  const selected = rev
    ? revsDesc.find((r) => r.id === rev)
    : revsDesc[0];
  const lines = selected
    ? db.bomLines.filter((l) => l.revisionId === selected.id)
    : [];
  const platform = db.bomPlatformLines.filter((p) => p.projectId === project.id);

  let drift: ReturnType<typeof reconcileBom> = [];
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
        })),
      );
    }
  }

  const historyInput = revsAsc.map((r) => {
    const snapRow = db.designSnapshots.find((s) => s.revisionId === r.id);
    let withUuid = db.bomLines
      .filter((l) => l.revisionId === r.id)
      .map((l) => ({
        refdes: l.refdes,
        value: l.value,
        footprint: l.footprint,
        mpn: l.mpn,
        manufacturer: l.manufacturer,
        uuid: undefined as string | undefined,
      }));
    if (snapRow) {
      try {
        const snap = JSON.parse(snapRow.dataJson) as DesignSnapshot;
        const byRef = new Map(snap.components.map((c) => [c.refdes, c.uuid]));
        withUuid = withUuid.map((l) => ({ ...l, uuid: byRef.get(l.refdes) }));
      } catch {
        /* ignore */
      }
    }
    const author = db.users.find((u) => u.id === r.authorId);
    return {
      revisionId: r.id,
      createdAt: r.createdAt,
      authorName: author?.name,
      message: r.message,
      lines: withUuid,
    };
  });
  const blameMap = blameAllBomLines(historyInput);
  const blame: Record<string, ReturnType<typeof blameMap.get>> = {};
  for (const [k, v] of blameMap) blame[k] = v;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">BOM</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          CAD owns value/footprint. Platform owns MPN / DNP / notes — we flag
          drift, never write back to the schematic.
        </p>
      </div>
      <BomClient
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        lines={lines}
        platform={platform}
        drift={drift}
        blame={blame as Record<string, unknown>}
        revisionId={selected?.id ?? null}
      />
    </div>
  );
}
