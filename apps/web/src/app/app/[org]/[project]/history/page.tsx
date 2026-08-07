import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@solderlab/ui";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const revs = getDb()
    .revisions.filter((r) => r.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight">History</h2>
      <ol className="relative space-y-0 border-l border-[var(--border)] pl-6">
        {revs.map((r, i) => {
          const newer = revs[i - 1];
          return (
            <li key={r.id} className="pb-8">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-[var(--accent)]" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.message}</span>
                <Badge
                  tone={r.parseStatus === "succeeded" ? "success" : "danger"}
                >
                  {r.parseStatus}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                {r.id} · {new Date(r.createdAt).toLocaleString()}
              </p>
              {newer ? (
                <Link
                  href={`/app/${orgSlug}/${projectSlug}/compare?base=${r.id}&head=${newer.id}`}
                  className="mt-2 inline-block text-xs text-[var(--accent)]"
                >
                  Compare with next →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
