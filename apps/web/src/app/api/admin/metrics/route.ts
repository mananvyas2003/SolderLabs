import { NextResponse } from "next/server";
import { getDb } from "@solderlab/db";
import { metricsForAllOrgs, readEvents } from "@solderlab/analytics";
import { getSessionUser } from "@/lib/auth";
import { ensureDb } from "@/lib/ensure-db";

export async function GET() {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Any signed-in member can view orgs they belong to; owners/admins also see
  // CLI (null-org) bucket when they own at least one org.
  const memberships = db.memberships.filter((m) => m.userId === user.id);
  const orgIds = [
    ...new Set(
      memberships
        .map((m) => m.orgId)
        .filter(Boolean),
    ),
  ];
  const isElevated = memberships.some(
    (m) => m.role === "admin" || m.role === "owner",
  );

  const rows = metricsForAllOrgs(orgIds, {
    includeCliNullOrg: isElevated,
  });

  const orgs = db.organizations.filter((o) => orgIds.includes(o.id));
  const labeled = rows.map((r) => {
    if (r.orgId === "__cli__") {
      return { ...r, orgName: "CLI / CI (no org)", orgSlug: "cli" };
    }
    const org = orgs.find((o) => o.id === r.orgId);
    return {
      ...r,
      orgName: org?.name ?? r.orgId,
      orgSlug: org?.slug ?? r.orgId,
    };
  });

  return NextResponse.json({
    metrics: labeled,
    eventCount: readEvents().length,
  });
}
