import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@solderlab/analytics";
import { getSessionUser } from "@/lib/auth";
import { ensureDb } from "@/lib/ensure-db";

/** Browser may only emit these — everything else is server/CLI. */
const CLIENT_EVENTS = ["diff_viewed", "ai_finding_action"] as const;

const bodySchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  orgId: z.string().nullable().optional(),
  props: z.record(z.unknown()),
});

/** Authenticated event ingest for browser-side product events only. */
export async function POST(req: Request) {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, orgId, props } = parsed.data;

  try {
    const ev = track(name, props as never, { orgId: orgId ?? null });
    return NextResponse.json({ ok: true, id: ev.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "track failed" },
      { status: 400 },
    );
  }
}
