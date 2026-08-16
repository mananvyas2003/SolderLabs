import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, revokeSessionToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) revokeSessionToken(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return res;
}
