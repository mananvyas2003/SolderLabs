#!/usr/bin/env node
/**
 * flux push — upload a local KiCad project zip to Flux
 * Usage:
 *   flux push --org flux-labs --project blinky --file ./board.zip --message "layout tweak"
 * Env:
 *   FLUX_URL=http://localhost:3000
 *   FLUX_EMAIL=demo@flux.dev
 *   FLUX_PASSWORD=demo
 */
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const base = process.env.FLUX_URL ?? "http://localhost:3000";
const email = process.env.FLUX_EMAIL ?? "demo@flux.dev";
const password = process.env.FLUX_PASSWORD ?? "demo";
const org = arg("org");
const project = arg("project");
const file = arg("file");
const message = arg("message", "flux push");

if (!org || !project || !file) {
  console.error(
    "Usage: flux push --org <slug> --project <slug> --file <zip> [--message msg]",
  );
  process.exit(1);
}

const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error("File not found:", abs);
  process.exit(1);
}

const loginRes = await fetch(`${base}/api/auth/sign-in`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) {
  console.error("Sign-in failed", await loginRes.text());
  process.exit(1);
}
const cookie = loginRes.headers.getSetCookie?.()?.[0] ?? "";
const cookieHeader =
  cookie ||
  (loginRes.headers.get("set-cookie") ?? "").split(",").map(s => s.split(";")[0].trim()).filter(Boolean).join("; ");

const fd = new FormData();
const buf = fs.readFileSync(abs);
fd.set("file", new Blob([buf]), path.basename(abs));
fd.set("message", message);

const up = await fetch(
  `${base}/api/orgs/${org}/projects/${project}/revisions`,
  {
    method: "POST",
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    body: fd,
  },
);
const text = await up.text();
if (!up.ok) {
  console.error("Upload failed", text);
  process.exit(1);
}
console.log(text);
