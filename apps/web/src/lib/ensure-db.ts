import path from "node:path";
import { getDb } from "@solderlab/db";
import { dataDir } from "@/lib/paths";

export function ensureDb() {
  if (!process.env.DATABASE_URL && !process.env.SOLDERLAB_DATABASE_URL) {
    process.env.DATABASE_URL = `file:${path.join(dataDir(), "solderlab.json")}`;
  }
  getDb();
}
