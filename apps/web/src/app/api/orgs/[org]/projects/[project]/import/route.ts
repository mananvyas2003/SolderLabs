import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { parseAltiumLikeText } from "@flux/parser";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject, getMainBranch } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

/** Best-effort Altium/CSV BOM import as a revision Design Snapshot */
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
  const branch = getMainBranch(project.id);
  if (!branch) return NextResponse.json({ error: "No branch" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  const message = String(form.get("message") ?? "Altium/CSV import");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const text = await file.text();
  const parsed = parseAltiumLikeText(text);
  if (!parsed.components.length) {
    return NextResponse.json({ error: parsed.note }, { status: 400 });
  }

  const db = getDb();
  const revisionId = nanoid();
  const now = nowIso();
  db.revisions.push({
    id: revisionId,
    projectId: project.id,
    branchId: branch.id,
    parentRevisionId: branch.headRevisionId,
    message: `${message} (${parsed.note})`,
    authorId: user.id,
    parseStatus: "succeeded",
    createdAt: now,
  });

  const snapshot = {
    schemaVersion: 1 as const,
    tool: { name: "altium-import", version: "best-effort" },
    sheets: [{ id: "import", name: "Import" }],
    components: parsed.components.map((c) => ({
      refdes: c.refdes,
      value: c.value,
      footprint: c.footprint,
      mpn: c.mpn,
      sheetId: "import",
    })),
    nets: [],
    meta: {
      sheetCount: 1,
      componentCount: parsed.components.length,
      netCount: 0,
    },
  };
  db.designSnapshots.push({
    id: nanoid(),
    revisionId,
    schemaVersion: 1,
    dataJson: JSON.stringify(snapshot),
  });
  for (const c of parsed.components) {
    db.bomLines.push({
      id: nanoid(),
      revisionId,
      refdes: c.refdes,
      value: c.value,
      footprint: c.footprint,
      mpn: c.mpn ?? null,
      manufacturer: null,
      qty: 1,
      attrsJson: null,
    });
  }
  branch.headRevisionId = revisionId;
  persist();
  logActivity({
    orgId: org.id,
    projectId: project.id,
    actorId: user.id,
    action: "revision.uploaded",
    summary: message,
    meta: { revisionId, import: "altium-csv" },
  });
  return NextResponse.json({ revisionId, count: parsed.components.length });
}
