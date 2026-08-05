import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { notFound } from "next/navigation";
import LibraryClient from "@/components/library-client";

export default async function LibraryPage({
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
  return <LibraryClient orgSlug={orgSlug} />;
}
