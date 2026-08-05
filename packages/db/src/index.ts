import fs from "node:fs";
import path from "node:path";
import {
  emptyDb,
  defaultDfmPartners,
  type FluxDb,
  type Project,
  type Organization,
  type User,
} from "./schema";

export * from "./schema";

function resolveDbPath() {
  const url = process.env.DATABASE_URL ?? "file:./data/flux.json";
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  const withExt = file.endsWith(".db")
    ? file.replace(/\.db$/i, ".json")
    : file.endsWith(".json")
      ? file
      : `${file}.json`;
  if (path.isAbsolute(withExt)) return withExt;
  return path.resolve(process.cwd(), withExt);
}

function migrate(raw: Partial<FluxDb>): FluxDb {
  const base = emptyDb();
  const merged = { ...base, ...raw } as FluxDb;
  for (const key of Object.keys(base) as (keyof FluxDb)[]) {
    if (!Array.isArray(merged[key])) {
      (merged as unknown as Record<string, unknown>)[key as string] = base[key];
    }
  }
  merged.projects = (merged.projects ?? []).map((p) => {
    const proj = p as Project & {
      requireGreenChecks?: boolean;
      starCount?: number;
    };
    return {
      ...proj,
      requireGreenChecks: proj.requireGreenChecks ?? true,
      requireApproval: proj.requireApproval ?? false,
      starCount: proj.starCount ?? 0,
      visibility: proj.visibility ?? "private",
    };
  });
  merged.organizations = (merged.organizations ?? []).map((o) => {
    const org = o as Organization & {
      dataRegion?: string;
      ssoEnabled?: boolean;
    };
    return {
      ...org,
      dataRegion: org.dataRegion ?? "local",
      ssoEnabled: org.ssoEnabled ?? false,
      ssoEntityId: org.ssoEntityId ?? null,
      ssoEntryUrl: org.ssoEntryUrl ?? null,
      ssoCertificate: org.ssoCertificate ?? null,
      ssoDomain: org.ssoDomain ?? null,
    };
  });
  merged.users = (merged.users ?? []).map((u) => {
    const user = u as User & { ssoProvider?: string | null };
    return { ...user, ssoProvider: user.ssoProvider ?? null };
  });
  merged.comments = (merged.comments ?? []).map((c) => ({
    ...c,
    anchorMetaJson: c.anchorMetaJson ?? null,
  }));
  if (!merged.dfmPartners?.length) {
    merged.dfmPartners = defaultDfmPartners();
  }
  return merged;
}

let cache: FluxDb | null = null;
let cachePath: string | null = null;

export function getDbPath() {
  return resolveDbPath();
}

export function getDb(): FluxDb {
  const dbPath = resolveDbPath();
  if (cache && cachePath === dbPath) return cache;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    cache = emptyDb();
    cachePath = dbPath;
    persist();
    return cache;
  }
  const raw = fs.readFileSync(dbPath, "utf8");
  cache = migrate(JSON.parse(raw) as Partial<FluxDb>);
  cachePath = dbPath;
  return cache;
}

export function persist() {
  if (!cache || !cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export function resetDbCache() {
  cache = null;
  cachePath = null;
}

export function nowIso() {
  return new Date().toISOString();
}
