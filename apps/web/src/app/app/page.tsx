import Link from "next/link";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { ensureDb } from "@/lib/ensure-db";
import { EmptyState } from "@solderlab/ui";
import { CreateOrgForm } from "@/components/create-org-form";

export default async function AppHome() {
  ensureDb();
  const user = await getSessionUser();
  if (!user) return null;
  const db = getDb();
  const orgs = db.memberships
    .filter((m) => m.userId === user.id)
    .map((m) => db.organizations.find((o) => o.id === m.orgId)!)
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose a workspace to open projects.
          </p>
        </div>
      </div>

      {orgs.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          body="Create your first org to start versioning boards."
          action={<CreateOrgForm />}
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`/app/${o.slug}`}
                className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0">
                  <div className="font-semibold">{o.name}</div>
                  <div className="font-mono text-xs text-[var(--text-muted)]">
                    {o.slug}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-[var(--accent)]">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {orgs.length > 0 ? (
        <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Create organization
          </summary>
          <div className="mt-4">
            <CreateOrgForm />
          </div>
        </details>
      ) : null}

      {orgs[0] ? (
        <QuickProjects orgSlug={orgs[0].slug} orgId={orgs[0].id} />
      ) : null}
    </div>
  );
}

function QuickProjects({ orgSlug, orgId }: { orgSlug: string; orgId: string }) {
  const list = getDb().projects.filter((p) => p.orgId === orgId);
  if (!list.length) return null;
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
        Jump back in · {orgSlug}
      </h2>
      <div className="flex flex-wrap gap-2">
        {list.map((p) => (
          <Link
            key={p.id}
            href={`/app/${orgSlug}/${p.slug}`}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
