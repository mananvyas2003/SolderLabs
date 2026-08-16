import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { SupplyDashboardClient } from "@/components/supply-dashboard";
import {
  DEFAULT_BUILD_QTY,
  DEFAULT_LEAD_TIME_WEEKS,
  DEFAULT_PRICE_CHANGE_PERCENT,
  DEFAULT_VOLUME_TIER_QTY,
} from "@solderlab/parts";

export default async function SupplyPage({
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
  const db = getDb();
  const settings = db.orgSupplySettings.find((s) => s.orgId === org.id) ?? {
    id: org.id,
    orgId: org.id,
    leadTimeWeeksThreshold: DEFAULT_LEAD_TIME_WEEKS,
    buildQty: DEFAULT_BUILD_QTY,
    priceChangePercent: DEFAULT_PRICE_CHANGE_PERCENT,
    volumeTierQty: DEFAULT_VOLUME_TIER_QTY,
  };
  const watches = db.partWatches.filter((w) => w.orgId === org.id);
  const alerts = db.partAlerts.filter((a) => a.orgId === org.id && !a.acknowledgedBy);
  const projectNames = Object.fromEntries(
    db.projects.filter((p) => p.orgId === org.id).map((p) => [p.id, p.name]),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/app/${orgSlug}`} className="text-sm text-[var(--accent)]">
        ← {org.name}
      </Link>
      <h1 className="text-2xl font-semibold">Supply risk</h1>
      <p className="text-sm text-[var(--text-muted)]">
        Lifecycle is never assumed active. Unknown or stale lastCheckedAt is shown
        explicitly.
      </p>
      <SupplyDashboardClient
        orgSlug={orgSlug}
        settings={settings}
        watches={watches}
        alerts={alerts}
        projectNames={projectNames}
      />
    </div>
  );
}
