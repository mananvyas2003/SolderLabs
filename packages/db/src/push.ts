import { getDb, persist, emptyDb, getDbPath } from "./index";
import fs from "node:fs";
import path from "node:path";

const p = getDbPath();
fs.mkdirSync(path.dirname(p), { recursive: true });
if (!fs.existsSync(p)) {
  fs.writeFileSync(p, JSON.stringify(emptyDb(), null, 2));
} else {
  // touch / normalize
  getDb();
  persist();
}
console.log("Database ready at", p);
