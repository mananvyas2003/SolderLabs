import fs from "node:fs";
import path from "node:path";
import { getDb, getJsonPath, resetDbCache } from "../packages/db/src/index.ts";

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function timeMs(fn, n = 21) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

const jsonPath = getJsonPath();
const raw = fs.readFileSync(jsonPath, "utf8");

function revisionsFrom(db) {
  const project = db.projects[0];
  return db.revisions.filter((r) => r.projectId === project.id);
}

function compareFrom(db) {
  const revs = revisionsFrom(db);
  const base = revs[1];
  const head = revs[0];
  if (!base || !head) return null;
  const a = db.designSnapshots.find((s) => s.revisionId === base.id);
  const b = db.designSnapshots.find((s) => s.revisionId === head.id);
  return { a: a?.id, b: b?.id };
}

const parsed = JSON.parse(raw);
const beforeRev = timeMs(() => revisionsFrom(parsed));
const beforeCmp = timeMs(() => compareFrom(parsed));

resetDbCache();
const sqliteDb = getDb();
const afterRev = timeMs(() => revisionsFrom(sqliteDb));
const afterCmp = timeMs(() => compareFrom(sqliteDb));

console.log("C5 median ms (21 samples, warm getDb cache — same as request path after ensureDb)");
console.log(`GET /revisions  before=${beforeRev.toFixed(3)}  after=${afterRev.toFixed(3)}`);
console.log(`GET /compare    before=${beforeCmp.toFixed(3)}  after=${afterCmp.toFixed(3)}`);
console.log("json", path.relative(process.cwd(), jsonPath));
