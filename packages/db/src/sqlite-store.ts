import fs from "node:fs";
import path from "node:path";
import { emptyDb, type SolderLabDb } from "./schema";
import { SQLITE_SCHEMA_SQL, TABLE_NAMES, type TableName } from "./sqlite-schema";
import { openSqliteFile, type Sql } from "./sqlite-open";

const BOOL_FIELDS: Partial<Record<TableName, string[]>> = {
  projects: ["requireGreenChecks", "requireApproval"],
  bomPlatformLines: ["dnp"],
  releases: ["immutable"],
  releaseShares: ["allowGerbers", "allowBom", "allowCad"],
  webhooks: ["active"],
};

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function encodeRow(table: TableName, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of BOOL_FIELDS[table] ?? []) {
    out[f] = out[f] ? 1 : 0;
  }
  if (table === "webhooks") {
    out.eventsJson = JSON.stringify(out.events ?? []);
    delete out.events;
  }
  if (table === "partWatches") {
    out.usedInJson = JSON.stringify(out.usedIn ?? []);
    out.priceBreaksJson = JSON.stringify(out.priceBreaks ?? []);
    delete out.usedIn;
    delete out.priceBreaks;
  }
  if (table === "partAlerts") {
    out.affectedProjectsJson = JSON.stringify(out.affectedProjects ?? []);
    delete out.affectedProjects;
  }
  if (table === "manualPartCatalog") {
    out.priceBreaksJson = JSON.stringify(out.priceBreaks ?? []);
    delete out.priceBreaks;
  }
  if (table === "emailOutbox") {
    out.toAddressesJson = JSON.stringify(out.toAddresses ?? []);
    delete out.toAddresses;
  }
  return out;
}

function decodeRow(table: TableName, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of BOOL_FIELDS[table] ?? []) {
    out[f] = toBool(out[f]);
  }
  if (table === "webhooks") {
    const raw = out.eventsJson;
    out.events = typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
    delete out.eventsJson;
  }
  if (table === "partWatches") {
    const used = out.usedInJson;
    const prices = out.priceBreaksJson;
    out.usedIn = typeof used === "string" ? JSON.parse(used) : [];
    out.priceBreaks = typeof prices === "string" ? JSON.parse(prices) : [];
    delete out.usedInJson;
    delete out.priceBreaksJson;
  }
  if (table === "partAlerts") {
    const raw = out.affectedProjectsJson;
    out.affectedProjects = typeof raw === "string" ? JSON.parse(raw) : [];
    delete out.affectedProjectsJson;
  }
  if (table === "manualPartCatalog") {
    const prices = out.priceBreaksJson;
    out.priceBreaks = typeof prices === "string" ? JSON.parse(prices) : [];
    delete out.priceBreaksJson;
  }
  if (table === "emailOutbox") {
    const raw = out.toAddressesJson;
    out.toAddresses = typeof raw === "string" ? JSON.parse(raw) : [];
    delete out.toAddressesJson;
  }
  return out;
}

export function jsonPathToSqlitePath(jsonOrSqlitePath: string): string {
  if (/\.sqlite$/i.test(jsonOrSqlitePath)) return jsonOrSqlitePath;
  if (/\.json$/i.test(jsonOrSqlitePath)) {
    return jsonOrSqlitePath.replace(/\.json$/i, ".sqlite");
  }
  return `${jsonOrSqlitePath}.sqlite`;
}

export function openSqlite(filePath: string): Sql {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = openSqliteFile(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 8000");
  db.pragma("synchronous = NORMAL");
  db.exec(SQLITE_SCHEMA_SQL);
  return db;
}

export function loadAll(sql: Sql): SolderLabDb {
  const out = emptyDb() as unknown as Record<string, unknown[]>;
  for (const table of TABLE_NAMES) {
    const rows = sql.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    out[table] = rows.map((r) => decodeRow(table, r));
  }
  return out as unknown as SolderLabDb;
}

export function tableCounts(sql: Sql): Record<TableName, number> {
  const counts = {} as Record<TableName, number>;
  for (const table of TABLE_NAMES) {
    const row = sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
  }
  return counts;
}

function idSet(rows: Array<{ id: string }>): Set<string> {
  return new Set(rows.map((r) => r.id));
}

export function snapshotIds(db: SolderLabDb): Record<TableName, Set<string>> {
  const out = {} as Record<TableName, Set<string>>;
  for (const table of TABLE_NAMES) {
    out[table] = idSet(db[table] as Array<{ id: string }>);
  }
  return out;
}

function columnsOf(sql: Sql, table: TableName): string[] {
  const info = sql.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return info.map((c) => c.name);
}

const colCache = new Map<string, string[]>();

function cols(sql: Sql, table: TableName): string[] {
  const key = table;
  let c = colCache.get(key);
  if (!c) {
    c = columnsOf(sql, table);
    colCache.set(key, c);
  }
  return c;
}

export function persistAll(
  sql: Sql,
  cache: SolderLabDb,
  loadedIds: Record<TableName, Set<string>>,
): Record<TableName, Set<string>> {
  const apply = () => {
    for (const table of TABLE_NAMES) {
      const rows = cache[table] as unknown as Array<Record<string, unknown> & { id: string }>;
      const names = cols(sql, table);
      const placeholders = names.map(() => "?").join(", ");
      const assignments = names
        .filter((n) => n !== "id")
        .map((n) => `${n}=excluded.${n}`)
        .join(", ");
      const upsert = sql.prepare(
        `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${assignments}`,
      );
      const current = new Set<string>();
      for (const row of rows) {
        const encoded = encodeRow(table, row);
        upsert.run(...names.map((n) => encoded[n] ?? null));
        current.add(row.id);
      }
      const del = sql.prepare(`DELETE FROM ${table} WHERE id = ?`);
      for (const id of loadedIds[table] ?? []) {
        if (!current.has(id)) del.run(id);
      }
    }
  };
  if (sql.inTransaction) apply();
  else sql.transaction(apply)();
  return snapshotIds(cache);
}

export function replaceAll(sql: Sql, cache: SolderLabDb): void {
  sql.transaction(() => {
    for (const table of TABLE_NAMES) {
      sql.prepare(`DELETE FROM ${table}`).run();
    }
    persistAll(sql, cache, snapshotIds(emptyDb()));
  })();
}
