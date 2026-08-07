import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import {
  diffSnapshots,
  localCopilotFindings,
  type DesignSnapshot,
} from "@solderlab/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return new Response(access.error, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return new Response("Not found", { status: 404 });

  const body = (await req.json()) as {
    baseRevisionId?: string;
    headRevisionId?: string;
    command?: string;
    message?: string;
  };
  if (!body.baseRevisionId || !body.headRevisionId) {
    return new Response("revisions required", { status: 400 });
  }

  const db = getDb();
  let diffRow = db.diffBundles.find(
    (d) =>
      d.projectId === project.id &&
      d.baseRevisionId === body.baseRevisionId &&
      d.headRevisionId === body.headRevisionId,
  );

  if (!diffRow) {
    const baseSnap = db.designSnapshots.find(
      (s) => s.revisionId === body.baseRevisionId,
    );
    const headSnap = db.designSnapshots.find(
      (s) => s.revisionId === body.headRevisionId,
    );
    if (!baseSnap || !headSnap) {
      return new Response("Snapshots missing", { status: 404 });
    }
    const data = diffSnapshots(
      JSON.parse(baseSnap.dataJson) as DesignSnapshot,
      JSON.parse(headSnap.dataJson) as DesignSnapshot,
      {
        baseRevisionId: body.baseRevisionId,
        headRevisionId: body.headRevisionId,
      },
    );
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
  const command =
    body.command ??
    (body.message?.trim().startsWith("/")
      ? body.message.trim().split(/\s+/)[0]
      : "/summarize");
  const explainTarget = body.message?.match(/^\/explain\s+(\S+)/i)?.[1];
  const result = localCopilotFindings(diff, command, explainTarget);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const chunks = result.markdown.split(/(\s+)/);
      let i = 0;
      const tick = () => {
        if (i >= chunks.length) {
          controller.enqueue(
            encoder.encode(
              `\n\n__FINDINGS__${JSON.stringify(result.findings)}\n`,
            ),
          );
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
        setTimeout(tick, 8);
      };
      tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
