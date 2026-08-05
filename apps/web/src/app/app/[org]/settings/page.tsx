import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { OrgEnterpriseSettings } from "@/components/org-enterprise-settings";

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  ensureDb();
  const { org: orgSlug } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/app/${orgSlug}`} className="text-sm text-[var(--accent)]">
        ← {org.name}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Enterprise settings</h1>
        <p className="text-sm text-[var(--text-muted)]">
          SSO/SAML and data residency (Phase 4)
        </p>
      </div>
      <OrgEnterpriseSettings orgSlug={orgSlug} />
    </div>
  );
}
