import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function isHashedPassword(stored: string | null | undefined): boolean {
  return Boolean(stored?.startsWith("scrypt$"));
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  if (!stored.startsWith("scrypt$")) {
    const a = Buffer.from(password);
    const b = Buffer.from(stored);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  const parts = stored.split("$");
  const salt = parts[1];
  const hash = parts[2];
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (check.length !== expected.length) return false;
  return timingSafeEqual(check, expected);
}

export function hashSessionToken(token: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}
