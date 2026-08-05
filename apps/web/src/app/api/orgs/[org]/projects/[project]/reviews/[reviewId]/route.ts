import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { revisionChecksPassing } from "@/lib/revisions";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ org: string; project: string; reviewId: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug, reviewId } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const review = db.designReviews.find(
    (r) => r.id === reviewId && r.projectId === project.id,
  );
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const thread = db.comments.filter((c) => c.reviewId === reviewId);
  const checks = db.checkRuns.filter((c) => c.revisionId === review.headRevisionId);
  return NextResponse.json({ review, comments: thread, checks, role: membership.role });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string; reviewId: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug, reviewId } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as {
    action?: "comment" | "approve" | "request-changes" | "merge";
    body?: string;
    anchorKind?: string;
    anchorRef?: string;
    anchorMeta?: Record<string, unknown>;
  };
  const db = getDb();
  const review = db.designReviews.find((r) => r.id === reviewId);
  if (!review || review.projectId !== project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "comment") {
    if (!can(membership.role, "review.comment")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!body.body) {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }
    const id = nanoid();
    db.comments.push({
      id,
      reviewId,
      authorId: user.id,
      body: body.body,
      parentId: null,
      anchorKind: body.anchorKind ?? null,
      anchorRef: body.anchorRef ?? null,
      anchorMetaJson: body.anchorMeta ? JSON.stringify(body.anchorMeta) : null,
      createdAt: nowIso(),
    });
    persist();
    logActivity({
      orgId: org.id,
      projectId: project.id,
      actorId: user.id,
      action: "review.commented",
      summary: `Comment on DR #${review.number}`,
      meta: { reviewId, anchorRef: body.anchorRef },
    });
    return NextResponse.json({ id });
  }

  if (body.action === "approve") {
    if (!can(membership.role, "review.approve")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    review.state = "approved";
    persist();
    logActivity({
      orgId: org.id,
      projectId: project.id,
      actorId: user.id,
      action: "review.approved",
      summary: `Approved DR #${review.number}`,
      meta: { reviewId },
    });
    return NextResponse.json({ state: "approved" });
  }

  if (body.action === "request-changes") {
    if (!can(membership.role, "review.approve")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    review.state = "changes_requested";
    persist();
    return NextResponse.json({ state: "changes_requested" });
  }

  if (body.action === "merge") {
    if (!can(membership.role, "review.merge")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (project.requireApproval && review.state !== "approved") {
      return NextResponse.json(
        { error: "Approval required before merge" },
        { status: 409 },
      );
    }
    const gate = revisionChecksPassing(project.id, review.headRevisionId);
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: "Required checks failing",
          failing: gate.failing.map((f) => ({
            name: f.name,
            summary: f.summary,
          })),
        },
        { status: 409 },
      );
    }
    review.state = "merged";
    review.mergedAt = nowIso();
    for (const b of db.branches.filter((x) => x.projectId === project.id)) {
      b.headRevisionId = review.headRevisionId;
    }
    persist();
    logActivity({
      orgId: org.id,
      projectId: project.id,
      actorId: user.id,
      action: "review.merged",
      summary: `Merged DR #${review.number}`,
      meta: { reviewId },
    });
    return NextResponse.json({ state: "merged" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
