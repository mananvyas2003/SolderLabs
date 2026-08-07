import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import AdmZip from "adm-zip";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { can } from "@/lib/rbac";
import { sha256, writeStorage, readStorage } from "@/lib/storage";
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
  const releases = getDb()
    .releases.filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ releases });
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
    tag?: string;
    title?: string;
    revisionId?: string;
    notes?: string;
  };
  if (!body.tag || !body.revisionId) {
    return NextResponse.json(
      { error: "tag and revisionId required" },
      { status: 400 },
    );
  }

  const db = getDb();
  if (db.releases.some((r) => r.projectId === project.id && r.tag === body.tag)) {
    return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
  }

  const rev = db.revisions.find(
    (r) => r.id === body.revisionId && r.projectId === project.id,
  );
  if (!rev) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

  const releaseId = nanoid();
  const now = nowIso();
  db.releases.push({
    id: releaseId,
    projectId: project.id,
    tag: body.tag,
    title: body.title ?? body.tag,
    revisionId: body.revisionId,
    notes: body.notes ?? null,
    createdBy: user.id,
    createdAt: now,
    immutable: true,
  });

  // Package BOM CSV + snapshot + source files into manufacturing zip
  const zip = new AdmZip();
  const bom = db.bomLines.filter((b) => b.revisionId === body.revisionId);
  const bomCsv = [
    "Ref,Value,Footprint,MPN,Manufacturer,Qty",
    ...bom.map(
      (b) =>
        `${b.refdes},${b.value},${b.footprint},${b.mpn ?? ""},${b.manufacturer ?? ""},${b.qty}`,
    ),
  ].join("\n");
  zip.addFile("BOM.csv", Buffer.from(bomCsv, "utf8"));

  const notes = [
    `# ${body.tag}`,
    ``,
    body.notes ?? "",
    ``,
    `Revision: ${body.revisionId}`,
    `Created: ${now}`,
  ].join("\n");
  zip.addFile("RELEASE_NOTES.md", Buffer.from(notes, "utf8"));

  const snap = db.designSnapshots.find((s) => s.revisionId === body.revisionId);
  if (snap) zip.addFile("design-snapshot.json", Buffer.from(snap.dataJson, "utf8"));
  const pcb = db.pcbSnapshots.find((s) => s.revisionId === body.revisionId);
  if (pcb) zip.addFile("pcb-snapshot.json", Buffer.from(pcb.dataJson, "utf8"));

  for (const art of db.artifacts.filter(
    (a) => a.revisionId === body.revisionId && a.path !== "source.zip",
  )) {
    try {
      zip.addFile(`design/${art.path}`, readStorage(art.storageKey));
    } catch {
      /* skip missing */
    }
  }

  const packageBuf = zip.toBuffer();
  const packageKey = `${project.id}/releases/${releaseId}/manufacturing.zip`;
  writeStorage(packageKey, packageBuf);
  const packageSha = sha256(packageBuf);
  db.releaseArtifacts.push({
    id: nanoid(),
    releaseId,
    path: "manufacturing.zip",
    storageKey: packageKey,
    sha256: packageSha,
    sizeBytes: packageBuf.length,
  });
  db.releaseArtifacts.push({
    id: nanoid(),
    releaseId,
    path: "BOM.csv",
    storageKey: packageKey,
    sha256: sha256(Buffer.from(bomCsv, "utf8")),
    sizeBytes: Buffer.byteLength(bomCsv),
  });

  persist();
  logActivity({
    orgId: org.id,
    projectId: project.id,
    actorId: user.id,
    action: "release.published",
    summary: `Released ${body.tag}`,
    meta: { releaseId, tag: body.tag, sha256: packageSha },
  });

  return NextResponse.json({
    id: releaseId,
    tag: body.tag,
    sha256: packageSha,
  });
}
