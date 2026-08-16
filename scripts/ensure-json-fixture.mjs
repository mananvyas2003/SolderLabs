import fs from "node:fs";
import path from "node:path";
import { emptyDb } from "../packages/db/src/index.ts";

const p = path.resolve("data/solderlab.json");
if (fs.existsSync(p)) {
  console.log("using existing", p);
  process.exit(0);
}
fs.mkdirSync(path.dirname(p), { recursive: true });
const db = emptyDb();
db.users.push({
  id: "user-1",
  email: "demo@solderlab.dev",
  name: "Demo",
  passwordHash: null,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});
db.organizations.push({
  id: "org-1",
  name: "Labs",
  slug: "solderlab",
  createdAt: "2026-01-01T00:00:00.000Z",
});
db.memberships.push({ id: "mem-1", orgId: "org-1", userId: "user-1", role: "admin" });
db.projects.push({
  id: "proj-1",
  orgId: "org-1",
  name: "Blinky",
  slug: "blinky",
  description: null,
  visibility: "private",
  defaultBranch: "main",
  requireGreenChecks: true,
  requireApproval: false,
  requiredApprovals: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
});
db.branches.push({ id: "br-1", projectId: "proj-1", name: "main", headRevisionId: null });
fs.writeFileSync(p, JSON.stringify(db, null, 2));
console.log("wrote fixture", p);
