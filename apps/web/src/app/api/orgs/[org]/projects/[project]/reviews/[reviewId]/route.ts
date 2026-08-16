import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { track } from "@solderlab/analytics";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { revisionChecksPassing } from "@/lib/revisions";
import { logActivity } from "@/lib/activity";
import { checkDto, reviewDto, validApprovals } from "@/lib/review-dto";

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
  return NextResponse.json({
    review: reviewDto(review, db),
    comments: thread.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId,
      anchorKind: c.anchorKind,
      anchorRef: c.anchorRef,
      anchorUuid: c.anchorUuid,
      author: {
        name: db.users.find((u) => u.id === c.authorId)?.name ?? "Unknown",
      },
    })),
    checks: checks.map(checkDto),
    approvals: validApprovals(db, reviewId, review.headRevisionId).map((a) => ({
      state: a.state,
      createdAt: a.createdAt,
      headRevisionSha: a.headRevisionSha,
      author: {
        name: db.users.find((u) => u.id === a.userId)?.name ?? "Unknown",
      },
    })),
    role: membership.role,
  });
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
    // Prefer KiCad UUID so comments survive refdes renumbers
    let anchorUuid: string | null = null;
    let anchorRef = body.anchorRef ?? null;
    if (body.anchorKind === "component" && body.anchorRef) {
      const headSnap = db.designSnapshots.find(
        (s) => s.revisionId === review.headRevisionId,
      );
      if (headSnap) {
        try {
          const snap = JSON.parse(headSnap.dataJson) as {
            components: Array<{ refdes: string; uuid?: string }>;
          };
          const hit = snap.components.find(
            (c) =>
              c.refdes === body.anchorRef ||
              c.uuid === body.anchorRef,
          );
          if (hit) {
            anchorUuid = hit.uuid ?? null;
            anchorRef = hit.refdes;
          }
        } catch {
          /* ignore */
        }
      }
    }
    const id = nanoid();
    db.comments.push({
      id,
      reviewId,
      authorId: user.id,
      body: body.body,
      parentId: null,
      anchorKind: body.anchorKind ?? null,
      anchorRef,
      anchorUuid,
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
      meta: { reviewId, anchorRef, anchorUuid },
    });
    return NextResponse.json({ id, anchorUuid });
  }

  if (body.action === "approve") {
    if (!can(membership.role, "review.approve")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (user.id === review.authorId) {
      return NextResponse.json(
        { error: "Authors cannot approve their own review" },
        { status: 409 },
      );
    }
    db.reviewApprovals.push({
      id: nanoid(),
      reviewId,
      userId: user.id,
      state: "approved",
      headRevisionSha: review.headRevisionId,
      createdAt: nowIso(),
    });
    const needed = project.requiredApprovals ?? 1;
    const n = validApprovals(db, reviewId, review.headRevisionId).length;
    if (n >= needed) review.state = "approved";
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
    db.reviewApprovals.push({
      id: nanoid(),
      reviewId,
      userId: user.id,
      state: "changes_requested",
      headRevisionSha: review.headRevisionId,
      createdAt: nowIso(),
    });
    review.state = "changes_requested";
    persist();
    return NextResponse.json({ state: "changes_requested" });
  }

  if (body.action === "merge") {
    if (!can(membership.role, "review.merge")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (project.requireApproval) {
      const needed = project.requiredApprovals ?? 1;
      const n = validApprovals(db, reviewId, review.headRevisionId).length;
      if (n < needed) {
        return NextResponse.json(
          { error: `Need ${needed} approval(s) on the current head` },
          { status: 409 },
        );
      }
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
    const target = db.branches.find(
      (b) =>
        b.projectId === project.id &&
        (review.targetBranchId
          ? b.id === review.targetBranchId
          : b.name === project.defaultBranch),
    );
    if (target) target.headRevisionId = review.headRevisionId;
    persist();
    const opened = new Date(review.createdAt).getTime();
    const merged = new Date(review.mergedAt).getTime();
    const commentCount = db.comments.filter((c) => c.reviewId === reviewId)
      .length;
    track(
      "review_merged",
      {
        reviewId,
        timeOpenToMergeMs: Math.max(0, merged - opened),
        commentCount,
      },
      { orgId: org.id },
    );
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
