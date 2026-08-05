import { nanoid } from "nanoid";
import { getDb, persist, nowIso } from "./index";

const db = getDb();
if (db.users.some((u) => u.email === "demo@flux.dev")) {
  console.log("Already seeded (demo@flux.dev exists).");
  process.exit(0);
}

const now = nowIso();
const userId = nanoid();
const orgId = nanoid();
const projectId = nanoid();
const branchId = nanoid();

db.users.push({
  id: userId,
  email: "demo@flux.dev",
  name: "Demo Engineer",
  passwordHash: "demo",
  avatarUrl: null,
  ssoProvider: null,
  createdAt: now,
});
db.organizations.push({
  id: orgId,
  name: "Flux Labs",
  slug: "flux-labs",
  dataRegion: "local",
  ssoEnabled: false,
  ssoEntityId: null,
  ssoEntryUrl: null,
  ssoCertificate: null,
  ssoDomain: null,
  createdAt: now,
});
db.memberships.push({
  id: nanoid(),
  orgId,
  userId,
  role: "owner",
});
db.projects.push({
  id: projectId,
  orgId,
  name: "Blinky Board",
  slug: "blinky",
  description: "Sample KiCad project for Flux demos",
  visibility: "private",
  defaultBranch: "main",
  requireGreenChecks: true,
  requireApproval: false,
  starCount: 0,
  createdAt: now,
});
db.branches.push({
  id: branchId,
  projectId,
  name: "main",
  headRevisionId: null,
});
persist();
console.log("Seeded demo user demo@flux.dev / demo");
console.log("Org: flux-labs · Project: blinky");
