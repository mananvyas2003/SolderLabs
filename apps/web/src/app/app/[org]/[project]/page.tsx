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

  const base = revs[1]?.id;
  const head = revs[0]?.id;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {org.slug} / {project.slug}
          </p>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {project.description || "Hardware project"}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <NavChip href={`/app/${orgSlug}/${projectSlug}/history`}>History</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/files`}>Files</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/bom`}>BOM</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/checks`}>Checks</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/pinout`}>Pinout</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/reviews`}>Reviews</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/releases`}>Releases</NavChip>
          <NavChip href={`/app/${orgSlug}/${projectSlug}/settings`}>Settings</NavChip>
          {base && head ? (
            <NavChip
              href={`/app/${orgSlug}/${projectSlug}/compare?base=${base}&head=${head}`}
              accent
            >
              Compare latest
            </NavChip>
          ) : null}
        </nav>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            Revisions
          </h2>
          {revs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No revisions yet. Seed fixtures or upload a KiCad zip.
            </p>
          ) : (
            <ul className="space-y-2">
              {revs.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-sm"
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
          <div className="flex flex-wrap gap-2 pt-2">
            <SeedFixturesButton orgSlug={orgSlug} projectSlug={projectSlug} />
          </div>
        </div>

        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            Upload revision
          </h2>
          <UploadRevisionForm orgSlug={orgSlug} projectSlug={projectSlug} />
          {checks.length ? (
            <div className="pt-2">
              <p className="mb-1 text-xs text-[var(--text-muted)]">
                Latest checks
              </p>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Badge tone={c.status === "pass" ? "success" : "danger"}>
                      {c.status}
                    </Badge>
                    <span>
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
          <h2 className="text-sm text-[var(--text-muted)]">Design Reviews</h2>
          <Link
            href={`/app/${orgSlug}/${projectSlug}/reviews`}
            className="text-xs text-[var(--accent)]"
          >
            View all
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No open reviews.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/${orgSlug}/${projectSlug}/reviews/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <span>
                    #{r.number} {r.title}
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

function NavChip({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        accent
          ? "rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)]"
          : "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
      }
    >
      {children}
    </Link>
  );
}
