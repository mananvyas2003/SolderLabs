import fs from "node:fs";
import path from "node:path";
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
  return merged as SolderLabDb;
}

let cache: SolderLabDb | null = null;
let cachePath: string | null = null;

export function getDbPath() {
  return resolveDbPath();
}

export function getDb(): SolderLabDb {
  const dbPath = resolveDbPath();
  if (cache && cachePath === dbPath) return cache;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // One-time: prefer migrating legacy data/flux.json if present and new file missing
  const legacy = path.resolve(process.cwd(), "data/flux.json");
  if (!fs.existsSync(dbPath) && fs.existsSync(legacy) && dbPath.endsWith("solderlab.json")) {
    const raw = fs.readFileSync(legacy, "utf8");
    cache = migrate(JSON.parse(raw) as Partial<SolderLabDb>);
    cachePath = dbPath;
    persist();
    return cache;
  }
  if (!fs.existsSync(dbPath)) {
    cache = emptyDb();
    cachePath = dbPath;
    persist();
    return cache;
  }
  const raw = fs.readFileSync(dbPath, "utf8");
  cache = migrate(JSON.parse(raw) as Partial<SolderLabDb>);
  cachePath = dbPath;
  return cache;
}

export function persist() {
  if (!cache || !cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  // Compact JSON — pretty-print was a major sync I/O cost on every write.
  fs.writeFileSync(cachePath, JSON.stringify(cache), "utf8");
}

export function resetDbCache() {
  cache = null;
  cachePath = null;
}

export function nowIso() {
  return new Date().toISOString();
}
