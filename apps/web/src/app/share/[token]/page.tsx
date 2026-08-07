import { notFound } from "next/navigation";
import { getDb, persist, nowIso } from "@solderlab/db";
import { ensureDb } from "@/lib/ensure-db";
import { nanoid } from "nanoid";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  ensureDb();
  const { token } = await params;
  const db = getDb();
  const share = db.releaseShares.find((s) => s.token === token);
  if (!share || share.revokedAt) notFound();
  if (new Date(share.expiresAt).getTime() < Date.now()) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-xl font-semibold">Share expired</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Ask the project owner for a new link. CAD source was never included.
        </p>
      </div>
    );
  }

  const release = db.releases.find((r) => r.id === share.releaseId);
  if (!release) notFound();
  const project = db.projects.find((p) => p.id === release.projectId);
  const org = project
    ? db.organizations.find((o) => o.id === project.orgId)
    : undefined;

  const artifacts = db.releaseArtifacts.filter((a) => a.releaseId === release.id);
  const gerbers = share.allowGerbers
    ? artifacts.filter((a) => /gerber|\.gbr|drill|pos|pnp|bom/i.test(a.path))
    : [];
  const bomLines = share.allowBom
    ? db.bomLines.filter((l) => l.revisionId === release.revisionId)
    : [];

  db.releaseShareAudits.push({
    id: nanoid(),
    shareId: share.id,
    action: "viewed",
    metaJson: null,
    createdAt: nowIso(),
  });
  persist();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <div>
        <p className="text-xs font-medium text-[var(--text-muted)]">
          Scoped release share
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {org?.name}/{project?.name} · {release.tag}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {share.label} · expires {new Date(share.expiresAt).toLocaleString()}
        </p>
        {share.watermark ? (
          <p className="mt-2 font-mono text-xs text-[var(--accent)]">
            watermark: {share.watermark}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          CAD source is not included. Audit-logged access only.
        </p>
      </div>

      {share.allowGerbers ? (
        <section className="border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium">Manufacturing files</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {gerbers.length ? (
              gerbers.map((a) => <li key={a.id}>{a.path}</li>)
            ) : (
              <li className="text-[var(--text-muted)]">
                No Gerber/PnP artifacts attached to this release yet
              </li>
            )}
          </ul>
        </section>
      ) : null}

      {share.allowBom ? (
        <section className="border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium">BOM</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="py-1">Ref</th>
                  <th className="py-1">Value</th>
                  <th className="py-1">MPN</th>
                </tr>
              </thead>
              <tbody>
                {bomLines.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--border)]">
                    <td className="py-1 font-mono text-xs">{l.refdes}</td>
                    <td className="py-1 text-xs">{l.value}</td>
                    <td className="py-1 font-mono text-xs">{l.mpn ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
