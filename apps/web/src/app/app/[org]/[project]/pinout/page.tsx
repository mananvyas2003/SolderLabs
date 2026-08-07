import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { PinoutPanel } from "@/components/pinout-panel";

export default async function PinoutPage({
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Firmware pinout</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Sync MCU/connector pins from schematic nets into firmware headers.
        </p>
      </div>
      <PinoutPanel orgSlug={orgSlug} projectSlug={projectSlug} />
    </div>
  );
}
