import path from "node:path";
import fs from "node:fs";

export function monorepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const j = JSON.parse(fs.readFileSync(pkg, "utf8")) as { name?: string };
        if (j.name === "solderlab") return dir;
      } catch {
        /* continue */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function dataDir() {
  const root = monorepoRoot();
  const d = path.join(root, "data");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function storageDir() {
  const d = path.join(dataDir(), "storage");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function dbFilePath() {
  const url = process.env.DATABASE_URL ?? process.env.SOLDERLAB_DATABASE_URL;
  if (url) {
    const file = url.startsWith("file:") ? url.slice("file:".length) : url;
    if (path.isAbsolute(file)) return file;
    return path.resolve(monorepoRoot(), file);
  }
  return path.join(dataDir(), "solderlab.json");
}
