import { getDb } from "@flux/db";

/** Fire-and-forget webhook delivery (best effort, no retry queue in MVP) */
export async function dispatchWebhooks(
  orgId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const hooks = getDb().webhooks.filter(
    (w) => w.orgId === orgId && w.active && w.events.includes(event),
  );
  await Promise.allSettled(
    hooks.map(async (hook) => {
      try {
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Flux-Event": event,
            ...(hook.secret ? { "X-Flux-Secret": hook.secret } : {}),
          },
          body: JSON.stringify({
            event,
            deliveredAt: new Date().toISOString(),
            data: payload,
          }),
        });
      } catch {
        /* ignore delivery errors in MVP */
      }
    }),
  );
}
