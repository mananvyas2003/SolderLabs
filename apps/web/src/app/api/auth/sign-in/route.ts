import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  getDb,
  persist,
  nowIso,
  hashPassword,
  verifyPassword,
  isHashedPassword,
} from "@solderlab/db";
import { ensureDb } from "@/lib/ensure-db";
import { COOKIE, cookieOptions, issueSession } from "@/lib/auth";

export async function POST(req: Request) {
  ensureDb();
  const body = (await req.json()) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const db = getDb();
  let user = db.users.find((u) => u.email === email);

  if (!user && email === "demo@solderlab.dev" && password === "demo") {
    const now = nowIso();
    const userId = nanoid();
    const orgId = nanoid();
    const projectId = nanoid();
    db.users.push({
      id: userId,
      email: "demo@solderlab.dev",
      name: "Demo Engineer",
      passwordHash: hashPassword("demo"),
      avatarUrl: null,
      createdAt: now,
    });
    db.organizations.push({
      id: orgId,
      name: "SolderLab Labs",
      slug: "solderlab",
      createdAt: now,
    });
    db.memberships.push({
      id: nanoid(),
      orgId,
      userId,
      role: "admin",
    });
    db.projects.push({
      id: projectId,
      orgId,
      name: "Blinky Board",
      slug: "blinky",
      description: "Sample KiCad project for SolderLab demos",
      visibility: "private",
      defaultBranch: "main",
      requireGreenChecks: true,
      requireApproval: false,
      requiredApprovals: 1,
      createdAt: now,
    });
    db.branches.push({
      id: nanoid(),
      projectId,
      name: "main",
      headRevisionId: null,
    });
    persist();
    user = db.users.find((u) => u.id === userId)!;
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.passwordHash && !isHashedPassword(user.passwordHash)) {
    user.passwordHash = hashPassword(password);
    persist();
  }

  const token = issueSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
  res.cookies.set(COOKIE, token, cookieOptions(60 * 60 * 24 * 30));
  return res;
}
