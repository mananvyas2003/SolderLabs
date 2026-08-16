import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { featureEnabled } from "@/lib/features";
import { notFound } from "next/navigation";
import WebhooksClient from "@/components/webhooks-client";

export default async function WebhooksPage({
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
  if (!featureEnabled("FEATURE_WEBHOOKS")) notFound();
  return <WebhooksClient orgSlug={orgSlug} />;
}
