import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { ProjectSettingsForm } from "@/components/project-settings-form";
import { ImportAltiumForm } from "@/components/import-altium-form";

export default async function ProjectSettingsPage({
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
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <h1 className="text-2xl font-semibold">Project settings</h1>
      <ProjectSettingsForm
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        requireGreenChecks={project.requireGreenChecks}
        requireApproval={project.requireApproval}
        visibility={project.visibility}
      />
      <section>
        <h2 className="mb-2 text-sm text-[var(--text-muted)]">
          Altium / CSV import (best-effort)
        </h2>
        <ImportAltiumForm orgSlug={orgSlug} projectSlug={projectSlug} />
      </section>
    </div>
  );
}
