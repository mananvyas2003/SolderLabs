import { NextResponse } from "next/server";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject, getMainBranch } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { createRevisionFromDir } from "@/lib/revisions";
import { monorepoRoot } from "@/lib/paths";
import { getDb, persist } from "@flux/db";

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
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const branch = getMainBranch(project.id);
  if (!branch) return NextResponse.json({ error: "No branch" }, { status: 500 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const root = monorepoRoot();
  const r1 = path.join(root, "fixtures", "kicad", "blinky", "r1");
  const r2 = path.join(root, "fixtures", "kicad", "blinky", "r2");

  const db = getDb();
  const existing = db.revisions.filter((r) => r.projectId === project.id);
  const hasPcb = db.pcbSnapshots.some((p) =>
    existing.some((r) => r.id === p.revisionId),
  );

  if (existing.length >= 2 && hasPcb && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      revisions: existing.map((r) => r.id),
    });
  }

  if (force || (existing.length && !hasPcb)) {
    const ids = new Set(existing.map((r) => r.id));
    db.revisions = db.revisions.filter((r) => r.projectId !== project.id);
    db.artifacts = db.artifacts.filter((a) => !ids.has(a.revisionId));
    db.designSnapshots = db.designSnapshots.filter((s) => !ids.has(s.revisionId));
    db.pcbSnapshots = db.pcbSnapshots.filter((s) => !ids.has(s.revisionId));
    db.bomLines = db.bomLines.filter((b) => !ids.has(b.revisionId));
    db.checkRuns = db.checkRuns.filter((c) => c.projectId !== project.id);
    db.diffBundles = db.diffBundles.filter((d) => d.projectId !== project.id);
    if (branch) branch.headRevisionId = null;
    persist();
  }

  const id1 = await createRevisionFromDir({
    projectId: project.id,
    branchId: branch.id,
    authorId: user.id,
    message: "Initial blinky schematic+PCB (r1)",
    dir: r1,
    orgId: org.id,
  });
  const id2 = await createRevisionFromDir({
    projectId: project.id,
    branchId: branch.id,
    authorId: user.id,
    message: "Decoupling + PCB update (r2)",
    dir: r2,
    parentRevisionId: id1,
    orgId: org.id,
  });

  return NextResponse.json({ ok: true, revisions: [id1, id2] });
}
