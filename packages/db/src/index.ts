import fs from "node:fs";
import path from "node:path";
import type { Sql } from "./sqlite-open";
import {
  emptyDb,
  normalizeRole,
  type SolderLabDb,
  type Project,
  type Organization,
  type User,
  type Comment,
} from "./schema";
import {
  jsonPathToSqlitePath,
  loadAll,
  openSqlite,
  persistChanged,
  captureRowSnapshot,
  replaceAll,
  type RowSnapshot,
} from "./sqlite-store";
import { TABLE_NAMES, type TableName } from "./sqlite-schema";

export * from "./schema";
export * from "./password";
export {
  jsonPathToSqlitePath,
  loadAll,
  openSqlite,
  persistAll,
  persistChanged,
  captureRowSnapshot,
  replaceAll,
  snapshotIds,
  tableCounts,
} from "./sqlite-store";
export type { RowSnapshot } from "./sqlite-store";
export { TABLE_NAMES } from "./sqlite-schema";
export type { TableName };

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const j = JSON.parse(fs.readFileSync(pkg, "utf8")) as { name?: string };
        if (j.name === "solderlab") return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function resolveJsonPath() {
  const url =
    process.env.DATABASE_URL ??
    process.env.SOLDERLAB_DATABASE_URL ??
    "file:./data/solderlab.json";
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  const withExt = file.endsWith(".db")
    ? file.replace(/\.db$/i, ".json")
    : file.endsWith(".sqlite")
      ? file.replace(/\.sqlite$/i, ".json")
      : file.endsWith(".json")
        ? file
        : `${file}.json`;
  const root = findRepoRoot();
  if (withExt.includes("solderlab.json") && !process.env.DATABASE_URL) {
    return path.resolve(root, "data/solderlab.json");
  }
  if (path.isAbsolute(withExt)) return withExt;
  return path.resolve(process.cwd(), withExt);
}

export function migrateJsonShape(
  raw: Partial<SolderLabDb> & Record<string, unknown>,
): SolderLabDb {
  const base = emptyDb();
  const merged = { ...base, ...raw } as SolderLabDb & Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof SolderLabDb)[]) {
    if (!Array.isArray(merged[key])) {
      (merged as unknown as Record<string, unknown>)[key as string] = base[key];
    }
  }
  delete merged.dfmPartners;
  delete merged.dfmJobs;
  delete merged.projectStars;

  merged.projects = (merged.projects ?? []).map((p) => {
    const proj = p as Project & {
      requireGreenChecks?: boolean;
      starCount?: number;
    };
    const { starCount: _s, ...rest } = proj as Project & { starCount?: number };
    return {
      ...rest,
      requireGreenChecks: proj.requireGreenChecks ?? true,
      requireApproval: proj.requireApproval ?? false,
      requiredApprovals: proj.requiredApprovals ?? 1,
      visibility:
        proj.visibility === "public" ? "internal" : (proj.visibility ?? "private"),
    };
  });
  merged.organizations = (merged.organizations ?? []).map((o) => {
    const org = o as Organization & Record<string, unknown>;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
    };
  });
  merged.users = (merged.users ?? []).map((u) => {
    const user = u as User & { ssoProvider?: string | null };
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  });
  merged.memberships = (merged.memberships ?? []).map((m) => ({
    ...m,
    role: normalizeRole(String(m.role)),
  }));
  merged.comments = (merged.comments ?? []).map((c) => {
    const row = c as Comment & { anchorUuid?: string | null };
    return {
      ...row,
      anchorUuid: row.anchorUuid ?? null,
      anchorMetaJson: row.anchorMetaJson ?? null,
    };
  });
  merged.designReviews = (merged.designReviews ?? []).map((r) => ({
    ...r,
    targetBranchId: r.targetBranchId ?? null,
  }));
  merged.checkRuns = (merged.checkRuns ?? []).map((c) => ({
    ...c,
    severity: c.severity ?? null,
  }));
  return merged as SolderLabDb;
}

/** @deprecated JSON-shape migrate — kept for the JSON→SQLite importer. */
const migrate = migrateJsonShape;

let cache: SolderLabDb | null = null;
let cachePath: string | null = null;
let sqlite: Sql | null = null;
let sqlitePath: string | null = null;
let rowSnapshot: RowSnapshot | null = null;

function countsOf(db: SolderLabDb): Record<TableName, number> {
  const out = {} as Record<TableName, number>;
  for (const t of TABLE_NAMES) out[t] = db[t].length;
  return out;
}

function sqliteHasRows(sql: Sql): boolean {
  const n = sql.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  const p = sql.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
  return n.n + p.n > 0;
}

function readJsonFile(jsonPath: string): SolderLabDb | null {
  if (fs.existsSync(jsonPath)) {
    return migrate(
      JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Partial<SolderLabDb>,
    );
  }
  const root = findRepoRoot();
  const canonical = path.resolve(root, "data/solderlab.json");
  const legacy = path.resolve(root, "data/flux.json");
  if (path.normalize(jsonPath) === path.normalize(canonical) && fs.existsSync(legacy)) {
    return migrate(
      JSON.parse(fs.readFileSync(legacy, "utf8")) as Partial<SolderLabDb>,
    );
  }
  return null;
}

export function getDbPath() {
  return jsonPathToSqlitePath(resolveJsonPath());
}

export function getJsonPath() {
  return resolveJsonPath();
}

export function getSqlite(): Sql {
  const jsonPath = resolveJsonPath();
  const file = jsonPathToSqlitePath(jsonPath);
  if (sqlite && sqlitePath === file) return sqlite;
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  sqlite = openSqlite(file);
  sqlitePath = file;
  return sqlite;
}

export function getDb(): SolderLabDb {
  const jsonPath = resolveJsonPath();
  const file = jsonPathToSqlitePath(jsonPath);
  const sql = getSqlite();
  if (!sqliteHasRows(sql)) {
    const fromJson = readJsonFile(jsonPath);
    if (fromJson) {
      replaceAll(sql, fromJson);
    }
  }
  cache = loadAll(sql);
  cachePath = file;
  rowSnapshot = captureRowSnapshot(cache);
  return cache;
}

export function persist() {
  if (!cache) return;
  const sql = getSqlite();
  rowSnapshot = persistChanged(
    sql,
    cache,
    rowSnapshot ?? captureRowSnapshot(emptyDb()),
  );
}

export function withTransaction<T>(fn: () => T): T {
  const sql = getSqlite();
  return sql.transaction(fn)();
}

export function resetDbCache() {
  cache = null;
  cachePath = null;
  rowSnapshot = null;
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  sqlitePath = null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function jsonCollectionCounts(db: SolderLabDb): Record<TableName, number> {
  return countsOf(db);
}
