import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const body = (await req.json()) as {
    action?: "star" | "unstar" | "set-visibility" | "clone";
    visibility?: string;
    targetOrgSlug?: string;
  };

  const db = getDb();

  if (body.action === "clone") {
    // Source may be public without membership
    const sourceOrg = db.organizations.find((o) => o.slug === orgSlug);
    if (!sourceOrg) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const source = getProject(sourceOrg.id, projectSlug);
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isMember = db.memberships.some(
      (m) => m.orgId === sourceOrg.id && m.userId === user.id,
    );
    if (source.visibility !== "public" && !isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetSlug = body.targetOrgSlug ?? orgSlug;
    const targetAccess = assertOrgAccess(targetSlug, user.id);
    if ("error" in targetAccess && targetAccess.error) {
      return NextResponse.json({ error: "Need membership in target org" }, { status: 403 });
    }
    const { org: targetOrg, membership } = targetAccess as Exclude<
      typeof targetAccess,
      { error: string }
    >;
    if (!can(membership.role, "project.create")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const newSlug = `${source.slug}-fork-${nanoid(4).toLowerCase()}`;
    const projectId = nanoid();
    const now = nowIso();
    db.projects.push({
      id: projectId,
      orgId: targetOrg.id,
      name: `${source.name} (fork)`,
      slug: newSlug,
      description: `Forked from ${orgSlug}/${projectSlug}`,
      visibility: "private",
      defaultBranch: "main",
      requireGreenChecks: source.requireGreenChecks,
      requireApproval: source.requireApproval,
      starCount: 0,
      createdAt: now,
    });
    db.branches.push({
      id: nanoid(),
      projectId,
      name: "main",
      headRevisionId: null,
    });

    // Copy latest snapshot/bom from source head if present
    const sourceBranch = db.branches.find(
      (b) => b.projectId === source.id && b.name === "main",
    );
    const headId = sourceBranch?.headRevisionId;
    if (headId) {
      const snap = db.designSnapshots.find((s) => s.revisionId === headId);
      const pcb = db.pcbSnapshots.find((s) => s.revisionId === headId);
      const bom = db.bomLines.filter((b) => b.revisionId === headId);
      const branch = db.branches.find((b) => b.projectId === projectId)!;
      const newRev = nanoid();
      db.revisions.push({
        id: newRev,
        projectId,
        branchId: branch.id,
        parentRevisionId: null,
        message: `Initial import from ${orgSlug}/${projectSlug}`,
        authorId: user.id,
        parseStatus: "succeeded",
        createdAt: now,
      });
      branch.headRevisionId = newRev;
      if (snap) {
        db.designSnapshots.push({
          id: nanoid(),
          revisionId: newRev,
          schemaVersion: snap.schemaVersion,
          dataJson: snap.dataJson,
        });
      }
      if (pcb) {
        db.pcbSnapshots.push({
          id: nanoid(),
          revisionId: newRev,
          schemaVersion: pcb.schemaVersion,
          dataJson: pcb.dataJson,
        });
      }
      for (const line of bom) {
        db.bomLines.push({ ...line, id: nanoid(), revisionId: newRev });
      }
    }

    persist();
    logActivity({
      orgId: targetOrg.id,
      projectId,
      actorId: user.id,
      action: "project.cloned",
      summary: `Cloned ${orgSlug}/${projectSlug} → ${newSlug}`,
    });
    return NextResponse.json({
      orgSlug: targetOrg.slug,
      projectSlug: newSlug,
    });
  }

  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    // allow starring public without membership
    if (body.action !== "star" && body.action !== "unstar") {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }
  }

  const org =
    "org" in access && access.org
      ? access.org
      : db.organizations.find((o) => o.slug === orgSlug);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "star" || body.action === "unstar") {
    if (project.visibility !== "public") {
      const mem = db.memberships.find(
        (m) => m.orgId === org.id && m.userId === user.id,
      );
      if (!mem) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const existing = db.projectStars.find(
      (s) => s.projectId === project.id && s.userId === user.id,
    );
    if (body.action === "star" && !existing) {
      db.projectStars.push({
        id: nanoid(),
        projectId: project.id,
        userId: user.id,
        createdAt: nowIso(),
      });
      project.starCount = (project.starCount ?? 0) + 1;
    }
    if (body.action === "unstar" && existing) {
      db.projectStars = db.projectStars.filter((s) => s.id !== existing.id);
      project.starCount = Math.max(0, (project.starCount ?? 1) - 1);
    }
    persist();
    return NextResponse.json({ starCount: project.starCount });
  }

  if (body.action === "set-visibility") {
    const mem = assertOrgAccess(orgSlug, user.id);
    if ("error" in mem && mem.error) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { membership } = mem as Exclude<typeof mem, { error: string }>;
    if (!can(membership.role, "org.invite")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!body.visibility || !["private", "internal", "public"].includes(body.visibility)) {
      return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }
    project.visibility = body.visibility;
    persist();
    logActivity({
      orgId: org.id,
      projectId: project.id,
      actorId: user.id,
      action: "project.visibility",
      summary: `Visibility → ${body.visibility}`,
    });
    return NextResponse.json({ visibility: project.visibility });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
