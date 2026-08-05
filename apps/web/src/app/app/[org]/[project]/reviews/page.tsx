import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@flux/ui";
import { CreateReviewForm } from "@/components/create-review-form";

export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const db = getDb();
  const reviews = db.designReviews
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const revs = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <h1 className="text-2xl font-semibold">Design Reviews</h1>

      <CreateReviewForm
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        revisions={revs.map((r) => ({
          id: r.id,
          message: r.message,
        }))}
      />

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {reviews.map((r) => (
          <li key={r.id}>
            <Link
              href={`/app/${orgSlug}/${projectSlug}/reviews/${r.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-1)]"
            >
              <span>
                #{r.number} {r.title}
              </span>
              <Badge tone="info">{r.state}</Badge>
            </Link>
          </li>
        ))}
        {!reviews.length ? (
          <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
            No reviews yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
