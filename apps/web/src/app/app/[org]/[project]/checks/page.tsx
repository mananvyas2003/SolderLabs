import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@solderlab/ui";

export default async function ChecksPage({
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
  const checks = getDb()
    .checkRuns.filter((c) => c.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Hardware checks</h2>
        <p className="text-sm text-[var(--text-muted)]">
          requireGreenChecks: {String(project.requireGreenChecks)} · requireApproval:{" "}
          {String(project.requireApproval)}
        </p>
      </div>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)]">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-[var(--text-muted)]">{c.summary}</div>
              <div className="font-mono text-xs text-[var(--text-muted)]">
                rev {c.revisionId.slice(0, 8)}
              </div>
            </div>
            <Badge tone={c.status === "pass" ? "success" : "danger"}>
              {c.status}
            </Badge>
          </li>
        ))}
        {!checks.length ? (
          <li className="px-4 py-6 text-[var(--text-muted)]">No checks yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
