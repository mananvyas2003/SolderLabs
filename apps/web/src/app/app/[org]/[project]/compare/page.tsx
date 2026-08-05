import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { CompareWorkspace } from "@/components/compare-workspace";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ base?: string; head?: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const { base, head } = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  if (!base || !head) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link
          href={`/app/${orgSlug}/${projectSlug}/history`}
          className="text-sm text-[var(--accent)]"
        >
          ← Pick revisions from History
        </Link>
        <p className="text-[var(--text-muted)]">
          Provide <code className="font-mono">?base=&amp;head=</code> query
          params.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <CompareWorkspace
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        base={base}
        head={head}
      />
    </div>
  );
}
