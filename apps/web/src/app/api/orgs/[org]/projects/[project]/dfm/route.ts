import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import type { PcbSnapshot } from "@flux/design-core";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { runLocalDfm } from "@/lib/dfm";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const partners = db.dfmPartners.filter((p) => p.active);
  const jobs = db.dfmJobs
    .filter((j) => j.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ partners, jobs, dataRegion: org.dataRegion });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; project: string }> },
) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { org: orgSlug, project: projectSlug } = await ctx.params;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { org, membership } = access as Exclude<typeof access, { error: string }>;
  if (!can(membership.role, "release.publish")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const project = getProject(org.id, projectSlug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    releaseId?: string;
    partnerKey?: string;
  };
  if (!body.releaseId || !body.partnerKey) {
    return NextResponse.json(
      { error: "releaseId and partnerKey required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const partner = db.dfmPartners.find(
    (p) => p.key === body.partnerKey && p.active,
  );
  if (!partner) {
    return NextResponse.json({ error: "Unknown partner" }, { status: 404 });
  }
  const release = db.releases.find(
    (r) => r.id === body.releaseId && r.projectId === project.id,
  );
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  // Prefer EU partner when org residency is EU
  if (org.dataRegion === "eu-west" && partner.key === "jlcpcb") {
    // soft note only — still allow
  }

  const pcbRow = db.pcbSnapshots.find((p) => p.revisionId === release.revisionId);
  const pcb = pcbRow
    ? (JSON.parse(pcbRow.dataJson) as PcbSnapshot)
    : null;
  const bomCount = db.bomLines.filter(
    (b) => b.revisionId === release.revisionId,
  ).length;

  const result = runLocalDfm(partner.key, pcb, bomCount);
  const now = nowIso();
  const id = nanoid();
  db.dfmJobs.push({
    id,
    orgId: org.id,
    projectId: project.id,
    releaseId: release.id,
    partnerKey: partner.key,
    status: result.status,
    summary: result.summary,
    detailsJson: JSON.stringify({
      findings: result.findings,
      residency: org.dataRegion,
      partnerEndpoint: partner.endpoint,
    }),
    externalId: `sim_${partner.key}_${id.slice(0, 8)}`,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  });
  persist();

  logActivity({
    orgId: org.id,
    projectId: project.id,
    actorId: user.id,
    action: "dfm.submitted",
    summary: `DFM ${result.status} via ${partner.name} for ${release.tag}`,
    meta: { jobId: id, partnerKey: partner.key },
  });

  return NextResponse.json({
    id,
    status: result.status,
    summary: result.summary,
    findings: result.findings,
  });
}
