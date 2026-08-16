/**
 * Read data/solderlab.json, write SQLite tables, verify counts, keep a dated JSON backup.
 */
import fs from "node:fs";
import path from "node:path";
import {
  emptyDb,
  getJsonPath,
  getSqlite,
  jsonCollectionCounts,
  migrateJsonShape,
  replaceAll,
  resetDbCache,
  tableCounts,
  type SolderLabDb,
} from "./index";

function backupJson(jsonPath: string): string | null {
  if (!fs.existsSync(jsonPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${jsonPath}.backup-${stamp}`;
  fs.copyFileSync(jsonPath, dest);
  return dest;
}

const jsonPath = getJsonPath();
const sqlPath = jsonPath.replace(/\.json$/i, ".sqlite");
console.log("JSON path:   ", jsonPath);
console.log("SQLite path: ", sqlPath);

let source: SolderLabDb;
if (fs.existsSync(jsonPath)) {
  source = migrateJsonShape(
    JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Partial<SolderLabDb>,
  );
} else {
  console.log("No JSON file present — migrating empty collections.");
  source = emptyDb();
}

const before = jsonCollectionCounts(source);
console.log("\n=== C1 before (JSON collections) ===");
for (const [k, n] of Object.entries(before)) {
  console.log(`${k.padEnd(22)} ${n}`);
}

const backup = backupJson(jsonPath);
if (backup) console.log("\nJSON backup:", backup);

resetDbCache();
const sql = getSqlite();
replaceAll(sql, source);
resetDbCache();
const after = tableCounts(getSqlite());

console.log("\n=== C1 after (SQLite tables) ===");
let mismatch = 0;
for (const [k, n] of Object.entries(before)) {
  const a = after[k as keyof typeof after];
  const ok = a === n ? "OK" : "MISMATCH";
  if (ok !== "OK") mismatch += 1;
  console.log(`${k.padEnd(22)} json=${n}\tsqlite=${a}\t${ok}`);
}

if (mismatch) {
  console.error(`\n${mismatch} table(s) did not match.`);
  process.exit(1);
}
console.log("\nAll table counts match.");
