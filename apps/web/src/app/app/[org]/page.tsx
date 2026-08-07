import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { CreateProjectForm } from "@/components/create-project-form";

export default async function OrgPage({
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
  const list = getDb().projects.filter((p) => p.orgId === org.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="font-mono text-xs text-[var(--text-muted)]">
            <Link href="/app" className="hover:text-[var(--accent)]">
              orgs
            </Link>
            <span aria-hidden> / </span>
            <span className="text-[var(--text)]">{org.slug}</span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {(
            [
              ["Library", "library"],
              ["Activity", "activity"],
              ["Webhooks", "webhooks"],
            ] as const
          ).map(([label, seg]) => (
            <Link
              key={seg}
              href={`/app/${org.slug}/${seg}`}
              className="rounded-[var(--radius)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <span className="text-xs text-[var(--text-subtle)]">
            {list.length} total
          </span>
        </div>
        {list.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-muted)]">
            No projects yet. Create one below.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/${org.slug}/${p.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="truncate text-sm text-[var(--text-muted)]">
                      {p.description || p.slug}
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
      </section>

      <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          New project
        </summary>
        <div className="mt-4">
          <CreateProjectForm orgSlug={org.slug} />
        </div>
      </details>
    </div>
  );
}
