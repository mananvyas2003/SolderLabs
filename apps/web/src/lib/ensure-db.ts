import { getDb, resetDbCache } from "@solderlab/db";
import { dbFilePath } from "@/lib/paths";

let ready = false;

export function ensureDb() {
  if (ready) return;
  const file = dbFilePath();
  process.env.DATABASE_URL = `file:${file}`;
  if (process.env.SOLDERLAB_FORCE_DB_RELOAD) {
    resetDbCache();
  }
  getDb();
  ready = true;
}
