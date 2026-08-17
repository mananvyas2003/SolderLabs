import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  analyzeImpact,
  analyzeImpactDeterministic,
  diffSnapshots,
  snapshotToBom,
  type DesignSnapshot,
} from "@solderlab/design-core";
import { generateBSC, diffBSC } from "@solderlab/bsc";
import {
  buildBoardCard,
  formatImpactHttpBody,
  maybeRunLlmClaims,
  type ToolHost,
} from "@solderlab/llm";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return Response.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    baseRevisionId?: string;
    headRevisionId?: string;
  };
  if (!body.baseRevisionId || !body.headRevisionId) {
    return Response.json({ error: "revisions required" }, { status: 400 });
  }

  const db = getDb();
  let diffRow = db.diffBundles.find(
    (d) =>
      d.projectId === project.id &&
      d.baseRevisionId === body.baseRevisionId &&
      d.headRevisionId === body.headRevisionId,
  );

  const baseSnap = db.designSnapshots.find(
    (s) => s.revisionId === body.baseRevisionId,
  );
  const headSnap = db.designSnapshots.find(
    (s) => s.revisionId === body.headRevisionId,
  );
  if (!baseSnap || !headSnap) {
    return Response.json({ error: "Snapshots missing" }, { status: 404 });
  }

  const base = JSON.parse(baseSnap.dataJson) as DesignSnapshot;
  const head = JSON.parse(headSnap.dataJson) as DesignSnapshot;

  if (!diffRow) {
    const data = diffSnapshots(base, head, {
      baseRevisionId: body.baseRevisionId,
      headRevisionId: body.headRevisionId,
    });
    const id = nanoid();
    diffRow = {
      id,
      projectId: project.id,
      baseRevisionId: body.baseRevisionId,
      headRevisionId: body.headRevisionId,
      dataJson: JSON.stringify(data),
      createdAt: nowIso(),
    };
    db.diffBundles.push(diffRow);
    persist();
  }

  const diff = JSON.parse(diffRow.dataJson);

  const baseBsc = generateBSC(base, {
    boardName: project.slug,
    revisionId: body.baseRevisionId,
  });
  const headBsc = generateBSC(head, {
    boardName: project.slug,
    revisionId: body.headRevisionId,
  });
  const bscChanges = diffBSC(baseBsc, headBsc);

  const latestRelease = [...db.releases]
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const openTransmittals = latestRelease
    ? db.downloadAudits
        .filter((d) => d.releaseId === latestRelease.id)
        .map((d, i) => {
          const u = db.users.find((x) => x.id === d.userId);
          return {
            supplierId: d.userId || `dl-${i}`,
            supplierName: u?.name ?? "Release recipient",
            revisionId: latestRelease.revisionId,
          };
        })
    : [];

  const testEvidence = db.checkRuns
    .filter(
      (c) =>
        c.projectId === project.id &&
        (c.revisionId === body.baseRevisionId ||
          c.revisionId === latestRelease?.revisionId),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      revisionId: c.revisionId,
      status: c.status,
      components: diff.components
        ?.filter((x: { kind: string }) => x.kind !== "unchanged")
        .slice(0, 20)
        .map((x: { refdes: string }) => x.refdes),
      nets: diff.nets
        ?.filter((x: { kind: string }) => x.kind !== "unchanged")
        .slice(0, 20)
        .map((x: { name: string }) => x.name),
    }));

  const host: ToolHost = {
    head,
    base,
    baseRevisionId: body.baseRevisionId,
    headRevisionId: body.headRevisionId,
    snapshotFor: (id) => {
      const row = db.designSnapshots.find((s) => s.revisionId === id);
      return row ? (JSON.parse(row.dataJson) as DesignSnapshot) : null;
    },
    checksFor: (revisionId) =>
      db.checkRuns
        .filter((c) => c.revisionId === revisionId)
        .map((c) => ({
          name: c.name,
          status: c.status,
          summary: c.summary,
        })),
    bomRevisionsFor: (revisionId) => {
      const snapRow = db.designSnapshots.find((s) => s.revisionId === revisionId);
      if (!snapRow) return [];
      const snap = JSON.parse(snapRow.dataJson) as DesignSnapshot;
      const rev = db.revisions.find((r) => r.id === revisionId);
      return [
        {
          revisionId,
          createdAt: rev?.createdAt ?? "",
          lines: snapshotToBom(snap).map((l) => ({
            refdes: l.refdes,
            uuid: l.uuid,
            value: l.value,
            footprint: l.footprint,
            mpn: l.mpn ?? null,
            manufacturer: l.manufacturer ?? null,
          })),
        },
      ];
    },
  };

  const context = {
    snapshot: head,
    bscChanges,
    openTransmittals,
    testEvidence,
    releasedRevisionId: latestRelease?.revisionId,
    headRevisionId: body.headRevisionId,
    baseRevisionId: body.baseRevisionId,
  };

  const ground = analyzeImpactDeterministic(diff, context);
  const llm = await maybeRunLlmClaims({
    ground,
    boardCard: buildBoardCard(head, {
      board: project.slug,
      revision: body.headRevisionId,
    }),
    host,
  });

  const report = await analyzeImpact(diff, context, {
    llm: async () => llm.claims,
  });

  return Response.json(formatImpactHttpBody(report, llm, llm.proposals));
}
