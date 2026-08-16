import { nanoid } from "nanoid";
import type { PartAlert, SolderLabDb } from "@solderlab/db";

export async function notifyPartAlerts(opts: {
  db: SolderLabDb;
  orgId: string;
  alerts: PartAlert[];
  nowIso: string;
  persist: () => void;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  if (!opts.alerts.length) return;
  const admins = opts.db.memberships.filter(
    (m) => m.orgId === opts.orgId && (m.role === "admin" || m.role === "owner"),
  );
  const emails = admins
    .map((m) => opts.db.users.find((u) => u.id === m.userId)?.email)
    .filter((e): e is string => Boolean(e));
  if (emails.length) {
    opts.db.emailOutbox.push({
      id: nanoid(),
      orgId: opts.orgId,
      toAddresses: emails,
      subject: `SolderLab supply alerts (${opts.alerts.length})`,
      body: opts.alerts
        .map(
          (a) =>
            `${a.severity.toUpperCase()} ${a.kind} ${a.mpn}: ${a.detail} (projects: ${a.affectedProjects.join(", ")})`,
        )
        .join("\n"),
      createdAt: opts.nowIso,
      sentAt: null,
    });
  }

  const hooks = opts.db.webhooks.filter(
    (w) =>
      w.orgId === opts.orgId &&
      w.active &&
      (w.events.includes("part.alert") || w.events.includes("*")),
  );
  const fetchImpl = opts.fetchImpl ?? fetch;
  const results = await Promise.allSettled(
    hooks.map((hook) =>
      fetchImpl(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-SolderLab-Event": "part.alert",
          ...(hook.secret ? { "X-SolderLab-Secret": hook.secret } : {}),
        },
        body: JSON.stringify({
          event: "part.alert",
          deliveredAt: opts.nowIso,
          data: { alerts: opts.alerts },
        }),
      }),
    ),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("part.alert webhook delivery failed", r.reason);
    } else if (!r.value.ok) {
      console.error(`part.alert webhook HTTP ${r.value.status}`);
    }
  }
  opts.persist();
}
