import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-c2-"));
const jsonPath = path.join(tmp, "solderlab.json");
const env = {
  ...process.env,
  DATABASE_URL: `file:${jsonPath}`,
};

function startWorker(port) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "packages/db/src/c2-worker.ts"],
    { cwd: root, env: { ...env, C2_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    const onData = (buf) => {
      const s = buf.toString();
      if (s.includes("listening")) {
        child.stdout.off("data", onData);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => {
      if (code) reject(new Error(`worker ${port} exited ${code}`));
    });
    setTimeout(() => reject(new Error(`worker ${port} timeout`)), 20000);
  });
}

const w0 = await startWorker(3000);
const w1 = await startWorker(3001);

const expected = 50;
const jobs = [];
for (let i = 0; i < expected; i++) {
  const port = i % 2 === 0 ? 3000 : 3001;
  jobs.push(
    fetch(`http://127.0.0.1:${port}/project`, { method: "POST" }).then((r) => {
      if (!r.ok) throw new Error(`POST ${port} ${r.status}`);
      return r.json();
    }),
  );
}
await Promise.all(jobs);
const counted = await fetch("http://127.0.0.1:3000/count").then((r) => r.json());
console.log("C2 expected", expected);
console.log("C2 actual  ", counted.projects);
console.log(counted.projects === expected ? "C2 PASS" : "C2 FAIL");

w0.kill();
w1.kill();
process.exit(counted.projects === expected ? 0 : 1);
