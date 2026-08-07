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
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pick a workspace or create one.
        </p>
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
                className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--surface-2)]"
              >
                <div>
                  <div className="font-medium">{o.name}</div>
                  <div className="font-mono text-xs text-[var(--text-muted)]">
                    {o.slug}
                  </div>
                </div>
                <span className="text-xs text-[var(--accent)]">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {orgs.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
            Create organization
          </h2>
          <CreateOrgForm />
        </div>
      ) : null}

      {orgs[0] ? <QuickProjects orgSlug={orgs[0].slug} orgId={orgs[0].id} /> : null}
    </div>
  );
}

function QuickProjects({ orgSlug, orgId }: { orgSlug: string; orgId: string }) {
  const list = getDb().projects.filter((p) => p.orgId === orgId);
  if (!list.length) return null;
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
        Recent in {orgSlug}
      </h2>
      <div className="flex flex-wrap gap-2">
        {list.map((p) => (
          <Link key={p.id} href={`/app/${orgSlug}/${p.slug}`}>
            <span className="inline-flex rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]">
              {p.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
