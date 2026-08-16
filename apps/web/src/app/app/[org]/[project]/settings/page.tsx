import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { ProjectSettingsForm } from "@/components/project-settings-form";

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
    <div className="max-w-xl space-y-8">
      <h2 className="text-lg font-semibold tracking-tight">Project settings</h2>
      <ProjectSettingsForm
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        requireGreenChecks={project.requireGreenChecks}
        requireApproval={project.requireApproval}
        requiredApprovals={project.requiredApprovals}
        visibility={project.visibility}
      />
    </div>
  );
}
