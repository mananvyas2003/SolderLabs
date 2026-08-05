import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@flux/db";
import { getSessionUser } from "@/lib/auth";
import { assertOrgAccess, getProject } from "@/lib/access";
import { ensureDb } from "@/lib/ensure-db";
import { Badge } from "@flux/ui";
import { DownloadReleaseButton } from "@/components/download-release-button";

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ org: string; project: string; releaseId: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug, releaseId } = await params;
  const user = await getSessionUser();
  if (!user) return null;
  const access = assertOrgAccess(orgSlug, user.id);
  if ("error" in access && access.error) notFound();
  const { org } = access as Exclude<typeof access, { error: string }>;
  const project = getProject(org.id, projectSlug);
  if (!project) notFound();
  const db = getDb();
  const release = db.releases.find(
    (r) => r.id === releaseId && r.projectId === project.id,
  );
  if (!release) notFound();
  const artifacts = db.releaseArtifacts.filter((a) => a.releaseId === releaseId);
  const downloads = db.downloadAudits.filter((d) => d.releaseId === releaseId);
  const pkg = artifacts.find((a) => a.path === "manufacturing.zip");
  const users = new Map(db.users.map((u) => [u.id, u.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/app/${orgSlug}/${projectSlug}/releases`}
        className="text-sm text-[var(--accent)]"
      >
        ← Releases
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-[var(--accent)]">{release.tag}</p>
          <h1 className="text-2xl font-semibold">{release.title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {release.notes || "No notes"}
          </p>
        </div>
        <Badge tone="success">immutable</Badge>
      </div>

      <section className="border border-[var(--border)] p-4">
        <h2 className="mb-2 text-sm text-[var(--text-muted)]">Checksums</h2>
        <ul className="space-y-2 font-mono text-xs">
          {artifacts.map((a) => (
            <li key={a.id} className="break-all">
              <span className="text-[var(--accent)]">{a.path}</span>
              <br />
              sha256:{a.sha256}
              <span className="text-[var(--text-muted)]">
                {" "}
                · {(a.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
        {pkg ? (
          <div className="mt-4">
            <DownloadReleaseButton
              orgSlug={orgSlug}
              projectSlug={projectSlug}
              releaseId={release.id}
            />
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm text-[var(--text-muted)]">Download audit</h2>
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] text-sm">
          {downloads.map((d) => (
            <li key={d.id} className="flex justify-between px-3 py-2">
              <span>{users.get(d.userId) ?? d.userId}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(d.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
          {!downloads.length ? (
            <li className="px-3 py-4 text-[var(--text-muted)]">No downloads yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
