import { cookies } from "next/headers";
import { getDb } from "@solderlab/db";
import { ensureDb } from "@/lib/ensure-db";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

const COOKIE = "solderlab_session";

export async function getSessionUser(): Promise<SessionUser | null> {
  ensureDb();
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const db = getDb();
  const row = db.users.find((u) => u.id === id);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export { COOKIE };
