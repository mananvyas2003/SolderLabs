import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { DfmPanel } from "@/components/dfm-panel";

export default async function DfmPage({
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">DFM partners</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Submit manufacturing releases to partner DFM profiles
        </p>
      </div>
      <DfmPanel orgSlug={orgSlug} projectSlug={projectSlug} />
    </div>
  );
}
