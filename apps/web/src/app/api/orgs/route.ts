import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { ensureDb } from "@/lib/ensure-db";

export async function GET() {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const orgs = db.memberships
    .filter((m) => m.userId === user.id)
    .map((m) => {
      const org = db.organizations.find((o) => o.id === m.orgId)!;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: m.role,
      };
    });
  return NextResponse.json({ orgs });
}

export async function POST(req: Request) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    name?: string;
    slug?: string;
  };
  if (!body.name || !body.slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }
  const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const db = getDb();
  if (db.organizations.some((o) => o.slug === slug)) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }
  const id = nanoid();
  db.organizations.push({
    id,
    name: body.name,
    slug,
    createdAt: nowIso(),
  });
  db.memberships.push({
    id: nanoid(),
    orgId: id,
    userId: user.id,
    role: "admin",
  });
  persist();
  return NextResponse.json({ id, slug, name: body.name });
}
