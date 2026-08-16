/**
 * C2: two Next.js processes, one SQLite file, 50 concurrent project creates.
 * Fails if persist rewrites the whole cache (last writer deletes the other process's rows).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import {
  getDb,
  persist,
  nowIso,
  resetDbCache,
  hashPassword,
} from "../packages/db/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-c2-"));
const sqlitePath = path.join(tmp, "solderlab.sqlite");
const DATABASE_URL = `file:${sqlitePath}`;
const AUTH_SECRET = process.env.AUTH_SECRET ?? "solderlab-dev-secret-change-me";
const orgSlug = "c2org";
const expected = 50;

process.env.DATABASE_URL = DATABASE_URL;
resetDbCache();
const seed = getDb();
const userId = nanoid();
const orgId = nanoid();
seed.users.push({
  id: userId,
  email: "c2@solderlab.dev",
  name: "C2",
  passwordHash: hashPassword("c2"),
  avatarUrl: null,
  createdAt: nowIso(),
});
seed.organizations.push({
  id: orgId,
  name: "C2",
  slug: orgSlug,
  createdAt: nowIso(),
});
seed.memberships.push({
  id: nanoid(),
  orgId,
  userId,
  role: "admin",
});
persist();
resetDbCache();

const require = createRequire(path.join(root, "package.json"));
const nextBin = require.resolve("next/dist/bin/next");
const webDir = path.join(root, "apps/web");

function startNext(port) {
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: webDir,
      env: {
        ...process.env,
        DATABASE_URL,
        AUTH_SECRET,
        PORT: String(port),
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return new Promise((resolve, reject) => {
    const onData = (buf) => {
      const s = buf.toString();
      process.stdout.write(`[next:${port}] ${s}`);
      if (/ready|started server|local:/i.test(s)) {
        child.stdout.off("data", onData);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (b) => {
      const s = b.toString();
      process.stderr.write(`[next:${port}:err] ${s}`);
      if (/ready|started server|local:/i.test(s)) {
        child.stdout.off("data", onData);
        resolve(child);
      }
    });
    child.on("exit", (code) => {
      if (code) reject(new Error(`next ${port} exited ${code}`));
    });
    setTimeout(() => reject(new Error(`next ${port} timeout`)), 180000);
  });
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? res.headers.get("set-cookie");
  if (Array.isArray(raw)) return raw.map((c) => c.split(";")[0]).join("; ");
  if (typeof raw === "string") return raw.split(";")[0];
  return "";
}

async function signIn(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "c2@solderlab.dev", password: "c2" }),
  });
  if (!res.ok) throw new Error(`sign-in ${port} ${res.status} ${await res.text()}`);
  const cookie = cookieFrom(res);
  if (!cookie) throw new Error(`sign-in ${port} missing cookie`);
  return cookie;
}

const w0 = await startNext(3450);
const w1 = await startNext(3451);
const cookie0 = await signIn(3450);
const cookie1 = await signIn(3451);

const jobs = [];
for (let i = 0; i < expected; i++) {
  const port = i % 2 === 0 ? 3450 : 3451;
  const cookie = port === 3450 ? cookie0 : cookie1;
  const slug = `c2-${i}`;
  jobs.push(
    fetch(`http://127.0.0.1:${port}/api/orgs/${orgSlug}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ name: slug, slug }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`POST ${port} ${r.status} ${await r.text()}`);
      return r.json();
    }),
  );
}
await Promise.all(jobs);

resetDbCache();
process.env.DATABASE_URL = DATABASE_URL;
const counted = getDb().projects.filter((p) => p.orgId === orgId).length;
console.log("C2 sqlite", sqlitePath);
console.log("C2 expected", expected);
console.log("C2 actual  ", counted);
console.log(counted === expected ? "C2 PASS" : "C2 FAIL");

function killTree(child) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}
killTree(w0);
killTree(w1);
process.exit(counted === expected ? 0 : 1);
