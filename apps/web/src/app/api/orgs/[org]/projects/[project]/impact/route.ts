import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  analyzeImpact,
  diffSnapshots,
  type DesignSnapshot,
  type DeterministicImpact,
  type ImpactReport,
  type RawLlmClaim,
} from "@solderlab/design-core";
import { generateBSC, diffBSC } from "@solderlab/bsc";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

async function optionalLlmClaims(
  ground: DeterministicImpact,
): Promise<RawLlmClaim[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];

  const sys = `You are an electrical impact assistant. Return JSON only: {"claims":[{"text":"...","citations":[{"kind":"component|net|bom_line","ref":"..."}]}]}.
Every claim MUST cite only refs from the provided ground-truth lists. Do not invent refdes or nets.`;

  const user = JSON.stringify({
    components: ground.connectedComponents.map((c) => c.refdes),
    nets: ground.touchedNets.map((n) => n.net),
    bom: ground.bom.lines.map((b) => b.refdes),
    bsc: ground.bscSurface.map((b) => b.message),
  });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content) as { claims?: RawLlmClaim[] };
    return parsed.claims ?? [];
  } catch {
    return [];
  }
}

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

  // Transmittals: model as release downloads still associated with prior revision
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
      // Soft bind ERC/connectivity checks to components/nets from the diff neighborhood later
      components: diff.components
        ?.filter((x: { kind: string }) => x.kind !== "unchanged")
        .slice(0, 20)
        .map((x: { refdes: string }) => x.refdes),
      nets: diff.nets
        ?.filter((x: { kind: string }) => x.kind !== "unchanged")
        .slice(0, 20)
        .map((x: { name: string }) => x.name),
    }));

  const report: ImpactReport = await analyzeImpact(
    diff,
    {
      snapshot: head,
      bscChanges,
      openTransmittals,
      testEvidence,
      releasedRevisionId: latestRelease?.revisionId,
      headRevisionId: body.headRevisionId,
      baseRevisionId: body.baseRevisionId,
    },
    {
      llm: async (ground) => optionalLlmClaims(ground),
    },
  );

  return Response.json({ data: report });
}
