import { getDb, persist, resetDbCache } from "@flux/db";
import { dbFilePath } from "@/lib/paths";

let ready = false;

export function ensureDb() {
  if (ready) return;
  const file = dbFilePath();
  process.env.DATABASE_URL = `file:${file}`;
  resetDbCache();
  getDb();
  persist();
  ready = true;
}
