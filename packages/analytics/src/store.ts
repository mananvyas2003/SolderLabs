import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  ALLOWED_EVENTS,
  type AnalyticsEnvelope,
  type AnalyticsEventName,
  type EventPropsMap,
} from "./events";

export interface TrackOptions {
  orgId?: string | null;
}

function newId(): string {
  return randomBytes(12).toString("hex");
}

function resolveStorePath(): string {
  if (process.env.SOLDERLAB_ANALYTICS_PATH) {
    return path.resolve(process.env.SOLDERLAB_ANALYTICS_PATH);
  }
  // Prefer monorepo data/ when running from apps/web or packages/*
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "data");
    if (fs.existsSync(candidate) || fs.existsSync(path.join(dir, "package.json"))) {
      const dataDir = path.join(dir, "data");
      fs.mkdirSync(dataDir, { recursive: true });
      return path.join(dataDir, "analytics-events.jsonl");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fallback = path.resolve(process.cwd(), "data");
  fs.mkdirSync(fallback, { recursive: true });
  return path.join(fallback, "analytics-events.jsonl");
}

export function getAnalyticsStorePath(): string {
  return resolveStorePath();
}

/**
 * Append a typed product event. Unknown event names are rejected.
 * Optional PostHog mirror when POSTHOG_KEY + POSTHOG_HOST are set.
 */
export function track<N extends AnalyticsEventName>(
  name: N,
  props: EventPropsMap[N],
  opts: TrackOptions = {},
): AnalyticsEnvelope<N> {
  if (!ALLOWED_EVENTS.includes(name)) {
    throw new Error(`Analytics event not allowed: ${String(name)}`);
  }
  const envelope: AnalyticsEnvelope<N> = {
    id: newId(),
    name,
    ts: new Date().toISOString(),
    orgId: opts.orgId ?? null,
    props,
  };
  appendJsonl(envelope);
  void mirrorPostHog(envelope);
  return envelope;
}

function appendJsonl(event: AnalyticsEnvelope): void {
  const file = resolveStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
}

async function mirrorPostHog(event: AnalyticsEnvelope): Promise<void> {
  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(
    /\/$/,
    "",
  );
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: event.name,
        distinct_id: event.orgId ?? "cli",
        properties: {
          ...event.props,
          orgId: event.orgId,
          solderlab_event_id: event.id,
        },
        timestamp: event.ts,
      }),
    });
  } catch {
    // Never fail product paths on analytics
  }
}

export function readEvents(opts?: {
  orgId?: string | null;
  sinceMs?: number;
}): AnalyticsEnvelope[] {
  const file = resolveStorePath();
  if (!fs.existsSync(file)) return [];
  const since = opts?.sinceMs ? Date.now() - opts.sinceMs : 0;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const out: AnalyticsEnvelope[] = [];
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as AnalyticsEnvelope;
      if (!ALLOWED_EVENTS.includes(ev.name)) continue;
      if (opts?.orgId != null && ev.orgId !== opts.orgId) continue;
      if (since && new Date(ev.ts).getTime() < since) continue;
      out.push(ev);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

/** Test helper — truncate store. */
export function resetAnalyticsStore(file?: string): void {
  const p = file ?? resolveStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "", "utf8");
}
