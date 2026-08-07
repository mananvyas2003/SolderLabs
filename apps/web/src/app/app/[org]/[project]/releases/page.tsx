import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@solderlab/ui";
import { CreateReleaseForm } from "@/components/create-release-form";

export default async function ReleasesPage({
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
  const releases = db.releases
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const revs = db.revisions
    .filter((r) => r.projectId === project.id && r.parseStatus === "succeeded")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <h1 className="text-2xl font-semibold">Manufacturing releases</h1>
      <CreateReleaseForm
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        revisions={revs.map((r) => ({ id: r.id, message: r.message }))}
      />
      <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {releases.map((r) => (
          <li key={r.id}>
            <Link
              href={`/app/${orgSlug}/${projectSlug}/releases/${r.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-2)]"
            >
              <span>
                <span className="font-mono text-[var(--accent)]">{r.tag}</span>{" "}
                {r.title}
              </span>
              <Badge tone="success">immutable</Badge>
            </Link>
          </li>
        ))}
        {!releases.length ? (
          <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
            No releases yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
