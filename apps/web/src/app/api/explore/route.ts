import { NextResponse } from "next/server";
import { getDb } from "@flux/db";
import { ensureDb } from "@/lib/ensure-db";

/** Public community explore — no auth required */
export async function GET() {
  ensureDb();
  const db = getDb();
  const projects = db.projects
    .filter((p) => p.visibility === "public")
    .map((p) => {
      const org = db.organizations.find((o) => o.id === p.orgId);
      const revs = db.revisions.filter((r) => r.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        starCount: p.starCount,
        orgSlug: org?.slug ?? "unknown",
        orgName: org?.name ?? "Unknown",
        revisionCount: revs.length,
        updatedAt: revs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          ?.createdAt,
      };
    })
    .sort((a, b) => (b.starCount ?? 0) - (a.starCount ?? 0));

  return NextResponse.json({ projects });
}
