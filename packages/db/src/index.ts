import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  emptyDb,
  normalizeRole,
  type SolderLabDb,
  type Project,
  type Organization,
  type User,
  type Comment,
} from "./schema";

export * from "./schema";
export * from "./password";

const require = createRequire(import.meta.url);

function resolveDbPath() {
  const url =
    process.env.DATABASE_URL ??
    process.env.SOLDERLAB_DATABASE_URL ??
    "file:./data/solderlab.json";
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  const withExt = file.endsWith(".db")
    ? file.replace(/\.db$/i, ".json")
    : file.endsWith(".json")
      ? file
      : `${file}.json`;
  // Migrate legacy solderlab.json path
  if (withExt.includes("solderlab.json") && !process.env.DATABASE_URL) {
    return path.resolve(process.cwd(), "data/solderlab.json");
  }
  if (path.isAbsolute(withExt)) return withExt;
  return path.resolve(process.cwd(), withExt);
}

function migrate(raw: Partial<SolderLabDb> & Record<string, unknown>): SolderLabDb {
  const base = emptyDb();
  const merged = { ...base, ...raw } as SolderLabDb & Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof SolderLabDb)[]) {
    if (!Array.isArray(merged[key])) {
      (merged as unknown as Record<string, unknown>)[key as string] = base[key];
    }
  }
  // Drop demolished collections if present in old JSON
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

let cache: SolderLabDb | null = null;
let cachePath: string | null = null;
let cacheMtime = 0;
let sqliteHandle: {
  get: () => string | null;
  set: (v: string) => void;
  path: string;
} | null = null;
let sqliteFailed = false;

function sqliteFileFor(jsonPath: string) {
  return jsonPath.replace(/\.json$/i, ".sqlite");
}

function openSqlite(jsonPath: string) {
  if (sqliteFailed) return null;
  if (sqliteHandle && sqliteHandle.path === sqliteFileFor(jsonPath)) {
    return sqliteHandle;
  }
  try {
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (path: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => {
          get: (...args: unknown[]) => { v: string } | undefined;
          run: (...args: unknown[]) => void;
        };
      };
    };
    const p = sqliteFileFor(jsonPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const db = new DatabaseSync(p);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 8000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec(
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    sqliteHandle = {
      path: p,
      get() {
        return db.prepare("SELECT v FROM kv WHERE k = ?").get("root")?.v ?? null;
      },
      set(v: string) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").run(
            "root",
            v,
          );
          db.exec("COMMIT");
        } catch (e) {
          try {
            db.exec("ROLLBACK");
          } catch {
            /* ignore */
          }
          throw e;
        }
      },
    };
    return sqliteHandle;
  } catch {
    sqliteFailed = true;
    sqliteHandle = null;
    return null;
  }
}

function atomicWriteJson(filePath: string, body: string) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  const lockPath = `${filePath}.lock`;
  const start = Date.now();
  let fd: number | null = null;
  while (fd == null) {
    try {
      fd = fs.openSync(lockPath, "wx");
    } catch {
      if (Date.now() - start > 8000) {
        throw new Error("Timed out waiting for datastore lock");
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    fs.writeFileSync(tmp, body, "utf8");
    try {
      fs.renameSync(tmp, filePath);
    } catch {
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    }
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

export function getDbPath() {
  return resolveDbPath();
}

export function getDb(): SolderLabDb {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sql = openSqlite(dbPath);
  if (sql) {
    const blob = sql.get();
    if (blob) {
      const mt = fs.existsSync(sql.path) ? fs.statSync(sql.path).mtimeMs : 0;
      if (cache && cachePath === dbPath && mt === cacheMtime) return cache;
      cache = migrate(JSON.parse(blob) as Partial<SolderLabDb>);
      cachePath = dbPath;
      cacheMtime = mt;
      return cache;
    }
  } else if (cache && cachePath === dbPath && fs.existsSync(dbPath)) {
    const mt = fs.statSync(dbPath).mtimeMs;
    if (mt === cacheMtime) return cache;
  }

  const legacy = path.resolve(process.cwd(), "data/flux.json");
  if (!fs.existsSync(dbPath) && fs.existsSync(legacy) && dbPath.endsWith("solderlab.json")) {
    const raw = fs.readFileSync(legacy, "utf8");
    cache = migrate(JSON.parse(raw) as Partial<SolderLabDb>);
    cachePath = dbPath;
    persist();
    return cache;
  }
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath, "utf8");
    cache = migrate(JSON.parse(raw) as Partial<SolderLabDb>);
    cachePath = dbPath;
    persist();
    return cache;
  }
  cache = emptyDb();
  cachePath = dbPath;
  persist();
  return cache;
}

export function persist() {
  if (!cache || !cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const body = JSON.stringify(cache);
  const sql = openSqlite(cachePath);
  if (sql) {
    sql.set(body);
    cacheMtime = fs.existsSync(sql.path) ? fs.statSync(sql.path).mtimeMs : Date.now();
    return;
  }
  atomicWriteJson(cachePath, body);
  cacheMtime = fs.statSync(cachePath).mtimeMs;
}

export function resetDbCache() {
  cache = null;
  cachePath = null;
  cacheMtime = 0;
  sqliteHandle = null;
  sqliteFailed = false;
}

export function nowIso() {
  return new Date().toISOString();
}
