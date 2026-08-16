import { getDb } from "@solderlab/db";
import type { DesignSnapshot } from "@solderlab/design-core";
import { buildBoardCard, runChat, type LlmRunMeta } from "@solderlab/llm";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { buildProjectToolHost } from "@/lib/llm-host";

type ChatTurn = { role: "user" | "assistant"; content: string };

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
    message?: string;
    messages?: ChatTurn[];
    revisionId?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return Response.json({ error: "message required" }, { status: 400 });
  }

  const db = getDb();
  const revs = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const headRevisionId = body.revisionId ?? revs[0]?.id ?? null;
  const baseRevisionId = revs.find((r) => r.id !== headRevisionId)?.id ?? null;

  const host = headRevisionId
    ? buildProjectToolHost({
        headRevisionId,
        baseRevisionId,
      })
    : null;

  const headSnap = headRevisionId
    ? db.designSnapshots.find((s) => s.revisionId === headRevisionId)
    : null;
  const snapshot = headSnap
    ? (JSON.parse(headSnap.dataJson) as DesignSnapshot)
    : null;
  const boardCard = snapshot
    ? buildBoardCard(snapshot, {
        board: project.slug,
        revision: headRevisionId ?? "none",
      })
    : null;

  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content ?? "") }))
    .slice(-12);

  const result = await runChat({
    host,
    boardCard,
    history,
    userMessage: message,
  });

  const llm: LlmRunMeta = {
    attempted: result.attempted,
    succeeded: result.succeeded,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    toolCallCount: result.toolCallCount,
    error: result.error,
  };

  if (!result.succeeded) {
    return Response.json(
      {
        ok: false,
        error: result.error ?? "Assistant failed",
        reply: "",
        llm,
        revisionId: headRevisionId,
      },
      { status: result.attempted ? 502 : 200 },
    );
  }

  return Response.json({
    ok: true,
    reply: result.reply,
    llm,
    revisionId: headRevisionId,
  });
}
