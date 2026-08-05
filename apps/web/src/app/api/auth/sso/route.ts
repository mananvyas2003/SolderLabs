import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "@flux/db";
import { ensureDb } from "@/lib/ensure-db";
import { COOKIE } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/**
 * Demo SSO/SAML ACS (Assertion Consumer Service).
 * Production would validate a signed SAMLResponse; here we accept a trusted
 * demo assertion for orgs with SSO enabled.
 *
 * POST { orgSlug, email, name?, samlResponse? }
 */
export async function POST(req: Request) {
  ensureDb();
  const body = (await req.json()) as {
    orgSlug?: string;
    email?: string;
    name?: string;
    /** Demo only — use "flux-demo-assertion" */
    assertion?: string;
  };

  if (!body.orgSlug || !body.email) {
    return NextResponse.json(
      { error: "orgSlug and email required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const org = db.organizations.find((o) => o.slug === body.orgSlug);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!org.ssoEnabled) {
    return NextResponse.json(
      { error: "SSO is not enabled for this organization" },
      { status: 403 },
    );
  }

  // Demo assertion gate (replace with real SAML signature validation)
  if (body.assertion !== "flux-demo-assertion") {
    return NextResponse.json(
      {
        error:
          "Invalid SAML assertion. For local demo use assertion: flux-demo-assertion",
      },
      { status: 401 },
    );
  }

  const email = body.email.trim().toLowerCase();
  if (org.ssoDomain) {
    const domain = email.split("@")[1];
    if (domain !== org.ssoDomain.toLowerCase()) {
      return NextResponse.json(
        { error: `Email must be @${org.ssoDomain}` },
        { status: 403 },
      );
    }
  }

  let user = db.users.find((u) => u.email === email);
  if (!user) {
    const id = nanoid();
    db.users.push({
      id,
      email,
      name: body.name?.trim() || email.split("@")[0],
      passwordHash: null,
      avatarUrl: null,
      ssoProvider: "saml",
      createdAt: nowIso(),
    });
    user = db.users.find((u) => u.id === id)!;
  } else {
    user.ssoProvider = "saml";
  }

  if (!db.memberships.some((m) => m.orgId === org.id && m.userId === user!.id)) {
    db.memberships.push({
      id: nanoid(),
      orgId: org.id,
      userId: user.id,
      role: "engineer",
    });
  }
  persist();

  logActivity({
    orgId: org.id,
    actorId: user.id,
    action: "auth.sso_login",
    summary: `SSO login for ${email}`,
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    org: { slug: org.slug },
  });
  res.cookies.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** List orgs that advertise SSO (by email domain hint) */
export async function GET(req: Request) {
  ensureDb();
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.toLowerCase();
  const orgs = getDb().organizations.filter((o) => {
    if (!o.ssoEnabled) return false;
    if (!domain) return true;
    return o.ssoDomain?.toLowerCase() === domain;
  });
  return NextResponse.json({
    orgs: orgs.map((o) => ({
      slug: o.slug,
      name: o.name,
      ssoDomain: o.ssoDomain,
      ssoEntryUrl: o.ssoEntryUrl,
    })),
  });
}
