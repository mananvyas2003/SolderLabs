import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const { rev } = await searchParams;
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
  const selected = rev ? revs.find((r) => r.id === rev) : revs[0];
  const files = selected
    ? db.artifacts.filter(
        (a) => a.revisionId === selected.id && a.path !== "source.zip",
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <h1 className="text-2xl font-semibold">Files</h1>
      <div className="flex flex-wrap gap-2">
        {revs.map((r) => (
          <Link
            key={r.id}
            href={`/app/${orgSlug}/${projectSlug}/files?rev=${r.id}`}
            className={`rounded px-2 py-1 font-mono text-xs ${
              selected?.id === r.id
                ? "bg-[var(--accent)] text-[#1a1208]"
                : "border border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            {r.id.slice(0, 8)}
          </Link>
        ))}
      </div>
      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] font-mono text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex justify-between px-3 py-2">
            <span>{f.path}</span>
            <span className="text-[var(--text-muted)]">
              {(f.sizeBytes / 1024).toFixed(1)} KB
            </span>
          </li>
        ))}
        {!files.length ? (
          <li className="px-3 py-6 text-[var(--text-muted)]">
            No files for this revision.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
