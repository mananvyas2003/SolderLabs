import type { CheckRun, DesignReview, SolderLabDb, User } from "@solderlab/db";

export function userPublic(user: User | undefined) {
  if (!user) return { name: "Unknown" };
  return { name: user.name };
}

export function reviewDto(review: DesignReview, db: SolderLabDb) {
  const author = db.users.find((u) => u.id === review.authorId);
  return {
    id: review.id,
    projectId: review.projectId,
    number: review.number,
    title: review.title,
    body: review.body,
    baseRevisionId: review.baseRevisionId,
    headRevisionId: review.headRevisionId,
    state: review.state,
    createdAt: review.createdAt,
    mergedAt: review.mergedAt,
    targetBranchId: review.targetBranchId,
    author: userPublic(author),
  };
}

export function checkDto(c: CheckRun) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    severity: c.severity ?? null,
    summary: c.summary,
    createdAt: c.createdAt,
    revisionId: c.revisionId,
  };
}

export function validApprovals(
  db: SolderLabDb,
  reviewId: string,
  headRevisionId: string,
) {
  return db.reviewApprovals.filter(
    (a) =>
      a.reviewId === reviewId &&
      a.state === "approved" &&
      a.headRevisionSha === headRevisionId,
  );
}
