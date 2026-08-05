import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { storageDir } from "@/lib/paths";

export function sha256(buf: Buffer | string) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function writeStorage(key: string, data: Buffer | string) {
  const full = path.join(storageDir(), key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return full;
}

export function readStorage(key: string) {
  return fs.readFileSync(path.join(storageDir(), key));
}

export function storagePath(key: string) {
  return path.join(storageDir(), key);
}
