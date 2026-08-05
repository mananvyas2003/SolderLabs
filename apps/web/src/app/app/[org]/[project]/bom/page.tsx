import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";

export default async function BomPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const { rev } = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const db = getDb();
  const revs = db.revisions
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = rev ? revs.find((r) => r.id === rev) : revs[0];
  const lines = selected
    ? db.bomLines.filter((l) => l.revisionId === selected.id)
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/app/${orgSlug}/${projectSlug}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {project.name}
      </Link>
      <h1 className="text-2xl font-semibold">BOM</h1>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 font-mono">Ref</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Footprint</th>
              <th className="px-3 py-2">MPN</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr
                key={l.id}
                id={`bom-${l.refdes}`}
                className="border-t border-[var(--border)]"
              >
                <td className="px-3 py-2 font-mono text-[var(--accent)]">
                  {l.refdes}
                </td>
                <td className="px-3 py-2">{l.value}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.footprint}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {l.mpn || (
                    <span className="text-[var(--warn)]">missing</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
