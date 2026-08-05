import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@flux/db";
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
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="font-mono text-xs text-[var(--text-muted)]">{org.slug}</p>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={`/app/${org.slug}/library`}
            className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
          >
            Library
          </Link>
          <Link
            href={`/app/${org.slug}/activity`}
            className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
          >
            Activity
          </Link>
          <Link
            href={`/app/${org.slug}/webhooks`}
            className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
          >
            Webhooks
          </Link>
          <Link
            href={`/app/${org.slug}/settings`}
            className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
          >
            Enterprise
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm text-[var(--text-muted)]">Projects</h2>
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={`/app/${org.slug}/${p.slug}`}
                className="block px-4 py-4 hover:bg-[var(--surface-1)]"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-[var(--text-muted)]">
                  {p.description || "No description"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm text-[var(--text-muted)]">New project</h2>
        <CreateProjectForm orgSlug={org.slug} />
      </section>
    </div>
  );
}
