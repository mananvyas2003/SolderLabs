import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { CompareWorkspace } from "@/components/compare-workspace";
import { ReviewActions } from "@/components/review-actions";
import { CommentForm } from "@/components/comment-form";
import { Badge } from "@solderlab/ui";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ org: string; project: string; reviewId: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug, reviewId } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const db = getDb();
  const review = db.designReviews.find(
    (r) => r.id === reviewId && r.projectId === project.id,
  );
  if (!review) notFound();

  // Resolve UUID anchors to current head refdes so comments survive renumbers
  let uuidToRefdes = new Map<string, string>();
  const headSnap = db.designSnapshots.find(
    (s) => s.revisionId === review.headRevisionId,
  );
  if (headSnap) {
    try {
      const snap = JSON.parse(headSnap.dataJson) as {
        components: Array<{ refdes: string; uuid?: string }>;
      };
      uuidToRefdes = new Map(
        snap.components
          .filter((c) => c.uuid)
          .map((c) => [c.uuid!, c.refdes] as const),
      );
    } catch {
      /* ignore */
    }
  }

  const thread = db.comments
    .filter((c) => c.reviewId === reviewId)
    .map((c) => {
      const liveRef =
        (c.anchorUuid && uuidToRefdes.get(c.anchorUuid)) || c.anchorRef;
      return {
        ...c,
        liveAnchorRef: liveRef,
        authorName: db.users.find((u) => u.id === c.authorId)?.name ?? "Unknown",
      };
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href={`/app/${orgSlug}/${projectSlug}/reviews`}
        className="text-sm text-[var(--accent)]"
      >
        ← Reviews
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            Design Review #{review.number}
          </p>
          <h1 className="text-2xl font-semibold">{review.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="accent">{review.state}</Badge>
          <ReviewActions
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            reviewId={review.id}
            state={review.state}
          />
        </div>
      </div>

      <CompareWorkspace
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        base={review.baseRevisionId}
        head={review.headRevisionId}
        reviewId={review.id}
        orgId={org.id}
      />

      <section className="border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm text-[var(--text-muted)]">Conversation</h2>
        <ul className="space-y-3">
          {thread.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">{c.authorName}</span>
              <span className="mx-2 text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-muted)]">
                {new Date(c.createdAt).toLocaleString()}
              </span>
              {c.liveAnchorRef || c.anchorRef ? (
                <span className="ml-2 font-mono text-xs text-[var(--accent)]">
                  @{c.anchorKind}:{c.liveAnchorRef ?? c.anchorRef}
                  {c.anchorUuid ? (
                    <span className="text-[var(--text-muted)]">
                      {" "}
                      (uuid {c.anchorUuid.slice(0, 8)}…)
                    </span>
                  ) : null}
                </span>
              ) : null}
              <p className="mt-1">{c.body}</p>
            </li>
          ))}
          {!thread.length ? (
            <li className="text-sm text-[var(--text-muted)]">No comments yet.</li>
          ) : null}
        </ul>
        <CommentForm
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          reviewId={review.id}
        />
      </section>
    </div>
  );
}
