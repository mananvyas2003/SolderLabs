import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { ProjectTabs } from "@/components/project-tabs";
import { ReviewRail } from "@/components/review-rail";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();

  const revs = getDb()
    .revisions.filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const base = revs[1]?.id ?? null;
  const head = revs[0]?.id ?? null;
  const compareHref =
    base && head
      ? `/app/${orgSlug}/${projectSlug}/compare?base=${base}&head=${head}`
      : null;

  return (
    <div className="-mx-4 flex min-h-[calc(100vh-3.5rem)] flex-col md:-mx-6">
      <header className="space-y-3 border-b border-[var(--border)] px-4 pb-0 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-[var(--text-muted)]"
            >
              <Link
                href={`/app/${org.slug}`}
                className="hover:text-[var(--accent)] hover:underline"
              >
                {org.slug}
              </Link>
              <span aria-hidden>/</span>
              <span className="text-[var(--text)]">{project.slug}</span>
            </nav>
            <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
              {project.name}
            </h1>
          </div>

          {compareHref ? (
            <Link
              href={compareHref}
              prefetch
              className="shrink-0 rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] active:opacity-90"
            >
              Compare latest
            </Link>
          ) : null}
        </div>

        <ProjectTabs orgSlug={orgSlug} projectSlug={projectSlug} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</div>
        <ReviewRail
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          baseRevisionId={base}
          headRevisionId={head}
          orgId={org.id}
        />
      </div>
    </div>
  );
}
