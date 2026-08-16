/**
 * C3: in-memory revision rows that never persist must not appear after rollback.
 */
import {
  getDb,
  persist,
  nowIso,
  resetDbCache,
  getSqlite,
  tableCounts,
} from "../packages/db/src/index.ts";
import { nanoid } from "nanoid";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-c3-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "solderlab.json")}`;
resetDbCache();

const db = getDb();
db.users.push({
  id: "u1",
  email: "c3@solderlab.dev",
  name: "C3",
  passwordHash: null,
  avatarUrl: null,
  createdAt: nowIso(),
});
db.organizations.push({
  id: "o1",
  name: "C3",
  slug: "c3",
  createdAt: nowIso(),
});
db.projects.push({
  id: "p1",
  orgId: "o1",
  name: "Board",
  slug: "board",
  description: null,
  visibility: "private",
  defaultBranch: "main",
  requireGreenChecks: true,
  requireApproval: false,
  requiredApprovals: 1,
  createdAt: nowIso(),
});
db.branches.push({
  id: "b1",
  projectId: "p1",
  name: "main",
  headRevisionId: null,
});
persist();

const before = tableCounts(getSqlite());
console.log("C3 before persist of failed upload", before.revisions, before.designSnapshots, before.checkRuns);

// Simulate createRevisionFromZip pushing rows then parse throwing (no persist).
db.revisions.push({
  id: nanoid(),
  projectId: "p1",
  branchId: "b1",
  parentRevisionId: null,
  message: "should not commit",
  authorId: "u1",
  parseStatus: "pending",
  createdAt: nowIso(),
});
db.designSnapshots.push({
  id: nanoid(),
  revisionId: "x",
  schemaVersion: 1,
  dataJson: "{}",
});
db.checkRuns.push({
  id: nanoid(),
  projectId: "p1",
  revisionId: "x",
  reviewId: null,
  name: "parse",
  status: "fail",
  summary: "deliberate",
  detailsJson: null,
  createdAt: nowIso(),
});

resetDbCache();
getDb();
const after = tableCounts(getSqlite());
console.log("C3 after rollback", after.revisions, after.designSnapshots, after.checkRuns);
const ok =
  after.revisions === before.revisions &&
  after.designSnapshots === before.designSnapshots &&
  after.checkRuns === before.checkRuns;
console.log(ok ? "C3 PASS" : "C3 FAIL");
process.exit(ok ? 0 : 1);
