import { cache } from "react";
import { cookies } from "next/headers";
import { getDb, persist, nowIso, hashSessionToken } from "@solderlab/db";
import { ensureDb } from "@/lib/ensure-db";
import { randomBytes } from "node:crypto";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

const isProd = process.env.NODE_ENV === "production";
/** `__Host-` requires Secure; HTTP localhost uses a plain name. */
export const COOKIE = isProd ? "__Host-solderlab" : "solderlab_session";

function pepper(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    maxAge,
  };
}

export function issueSession(userId: string): string {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = new Date(now + 60 * 60 * 24 * 30 * 1000).toISOString();
  db.sessions.push({
    id: randomBytes(12).toString("hex"),
    userId,
    tokenHash: hashSessionToken(token, pepper()),
    createdAt: nowIso(),
    expiresAt,
  });
  persist();
  return token;
}

export function revokeSessionToken(token: string) {
  const db = getDb();
  const hash = hashSessionToken(token, pepper());
  db.sessions = db.sessions.filter((s) => s.tokenHash !== hash);
  persist();
}

/** Deduped within a single RSC render (layout + page share one lookup). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  ensureDb();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const hash = hashSessionToken(token, pepper());
  const session = db.sessions.find(
    (s) => s.tokenHash === hash && new Date(s.expiresAt).getTime() > Date.now(),
  );
  if (!session) return null;
  const row = db.users.find((u) => u.id === session.userId);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
});
