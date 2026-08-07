import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "./index";

const db = getDb();
if (db.users.some((u) => u.email === "demo@solderlab.dev")) {
  console.log("Already seeded (demo@solderlab.dev exists).");
  process.exit(0);
}

const now = nowIso();
const userId = nanoid();
const orgId = nanoid();
const projectId = nanoid();
const branchId = nanoid();

db.users.push({
  id: userId,
  email: "demo@solderlab.dev",
  name: "Demo Engineer",
  passwordHash: "demo",
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
  createdAt: now,
});
db.branches.push({
  id: branchId,
  projectId,
  name: "main",
  headRevisionId: null,
});
persist();
console.log("Seeded demo user demo@solderlab.dev / demo");
console.log("Org: solderlab · Project: blinky");
