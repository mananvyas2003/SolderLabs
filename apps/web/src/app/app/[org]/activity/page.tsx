import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  ensureDb();
  const { org: orgSlug } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const events = getDb()
    .activityEvents.filter((e) => e.orgId === org.id)
    .slice(0, 80);
  const users = new Map(getDb().users.map((u) => [u.id, u.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/app/${orgSlug}`} className="text-sm text-[var(--accent)]">
        ← {org.name}
      </Link>
      <h1 className="text-2xl font-semibold">Activity</h1>
      <ol className="divide-y divide-[var(--border)] border border-[var(--border)]">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{e.summary}</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {e.action}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {e.actorId ? users.get(e.actorId) ?? "system" : "system"} ·{" "}
              {new Date(e.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
        {!events.length ? (
          <li className="px-4 py-6 text-[var(--text-muted)]">No activity yet.</li>
        ) : null}
      </ol>
    </div>
  );
}
