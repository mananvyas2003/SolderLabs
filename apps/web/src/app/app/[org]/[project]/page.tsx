import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@solderlab/ui";
import { SeedFixturesButton } from "@/components/seed-fixtures-button";
import { UploadRevisionForm } from "@/components/upload-revision-form";

export default async function ProjectPage({
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
  const revs = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviews = db.designReviews
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const latest = revs[0];
  const checks = latest
    ? db.checkRuns.filter((c) => c.revisionId === latest.id)
    : [];

  return (
    <div className="space-y-8">
      <aside className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 lg:hidden">
        <p className="text-sm font-semibold">SolderLab Review</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Open the sparkle icon in the top-right header for Copilot chat while
          you keep working. Use{" "}
          <span className="font-medium text-[var(--text)]">Review · AI</span>{" "}
          (bottom-right) for rule-based risk suggestions.
        </p>
      </aside>

      <section className="grid gap-[var(--bento-gap,12px)] md:grid-cols-2">
        <div className="sl-bento space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--text)]">Revisions</h2>
            <Link
              href={`/app/${orgSlug}/${projectSlug}/history`}
              className="text-xs font-medium text-[var(--accent-2)] hover:underline"
            >
              Full history
            </Link>
          </div>
          {revs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No revisions yet. Seed fixtures or upload a KiCad zip / .kicad_sch.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {revs.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
                >
                  <span className="truncate">{r.message}</span>
                  <Badge
                    tone={
                      r.parseStatus === "succeeded"
                        ? "success"
                        : r.parseStatus === "failed"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {r.parseStatus}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-1">
            <SeedFixturesButton orgSlug={orgSlug} projectSlug={projectSlug} />
          </div>
        </div>

        <div className="sl-bento space-y-3">
          <h2 className="text-sm font-medium text-[var(--text)]">Upload revision</h2>
          <UploadRevisionForm orgSlug={orgSlug} projectSlug={projectSlug} />
          {checks.length ? (
            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Latest checks
              </p>
              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Badge
                      tone={
                        c.status === "pass"
                          ? "success"
                          : c.status === "skipped"
                            ? "neutral"
                            : c.status === "pending" || c.status === "running"
                              ? "warn"
                              : "danger"
                      }
                    >
                      {c.status}
                    </Badge>
                    <span className="truncate">
                      {c.name}: {c.summary}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text)]">Design reviews</h2>
          <Link
            href={`/app/${orgSlug}/${projectSlug}/reviews`}
            className="text-xs font-medium text-[var(--accent-2)] hover:underline"
          >
            View all
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-muted)]">
            No open reviews. Open the Reviews tab to start one.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/${orgSlug}/${projectSlug}/reviews/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <span className="text-sm">
                    <span className="font-mono text-[var(--text-muted)]">
                      #{r.number}
                    </span>{" "}
                    {r.title}
                  </span>
                  <Badge
                    tone={
                      r.state === "merged"
                        ? "success"
                        : r.state === "approved"
                          ? "accent"
                          : r.state === "changes_requested"
                            ? "warn"
                            : "info"
                    }
                  >
                    {r.state}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
