import { NextResponse } from "next/server";
import { PART_DATA_API_KEY, runNightlyPartWatch } from "@solderlab/parts";
import { ensureDb } from "@/lib/ensure-db";

export async function POST(req: Request) {
  ensureDb();
  const expected = process.env[PART_DATA_API_KEY];
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!expected || bearer !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runNightlyPartWatch();
  return NextResponse.json(result);
}
