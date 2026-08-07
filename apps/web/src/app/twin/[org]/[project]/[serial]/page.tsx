import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@solderlab/db";
import { ensureDb } from "@/lib/ensure-db";

/**
 * Board QR → digital twin. Public read of revision + BOM + BSC pointer.
 * Silkscreen datamatrix encodes /twin/<org>/<project>/<serial>
 */
export default async function TwinPage({
  params,
}: {
  params: Promise<{ org: string; project: string; serial: string }>;
}) {
  ensureDb();
  const { org: orgSlug, project: projectSlug, serial } = await params;
  const db = getDb();
  const org = db.organizations.find((o) => o.slug === orgSlug);
  const project = org
    ? db.projects.find((p) => p.orgId === org.id && p.slug === projectSlug)
    : undefined;
  if (!org || !project) notFound();

  let unit = db.boardUnits.find(
    (u) => u.projectId === project.id && u.serial === serial,
  );
  // Allow resolving by revision id / tag as fallback for demo QR
  const release = db.releases.find(
    (r) => r.projectId === project.id && (r.tag === serial || r.id === serial),
  );
  const revisionId =
    unit?.revisionId ??
    release?.revisionId ??
    db.branches.find((b) => b.projectId === project.id)?.headRevisionId;
  if (!revisionId) notFound();

  const revision = db.revisions.find((r) => r.id === revisionId);
  if (!revision) notFound();

  if (!unit) {
    // ephemeral view without persisted unit row still works for released tags
  }

  const bom = db.bomLines.filter((l) => l.revisionId === revisionId);
  const pinout = db.firmwarePinouts.find((p) => p.revisionId === revisionId);
  const twinPath = `/twin/${orgSlug}/${projectSlug}/${encodeURIComponent(serial)}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Digital twin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-1 font-mono text-sm text-[var(--text-muted)]">
          SN {serial}
        </p>
      </div>

      <section className="border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">Revision</h2>
        <p className="mt-1 font-mono text-xs">{revision.id}</p>
        <p className="mt-2 text-sm">{revision.message}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {new Date(revision.createdAt).toLocaleString()}
        </p>
      </section>

      <section className="border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">BOM ({bom.length} lines)</h2>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
          {bom.slice(0, 40).map((l) => (
            <li key={l.id}>
              {l.refdes} · {l.value} · {l.mpn ?? "no-mpn"}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">Board Support Contract</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {pinout
            ? `Pinout synced for ${pinout.targetRefdes}`
            : "Pull via `solderlab bsc pull --board " + projectSlug + "`"}
        </p>
      </section>

      <section className="border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">Known bodges</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {unit?.notes?.trim() || "None recorded on this unit"}
        </p>
      </section>

      <div className="flex items-end justify-between gap-4 border border-[var(--border)] p-4">
        <div>
          <p className="text-xs text-[var(--text-muted)]">QR payload</p>
          <p className="mt-1 break-all font-mono text-xs">{twinPath}</p>
        </div>
        {/* Lightweight SVG QR substitute: datamatrix-style placeholder pattern */}
        <svg
          width="96"
          height="96"
          viewBox="0 0 33 33"
          className="shrink-0 border border-[var(--border)] bg-white"
          role="img"
          aria-label="QR placeholder encoding twin URL"
        >
          {Array.from({ length: 33 * 33 }).map((_, i) => {
            const x = i % 33;
            const y = Math.floor(i / 33);
            const bit =
              (serial.charCodeAt((x + y) % serial.length) + x * 3 + y * 7) % 5 ===
              0;
            const finder =
              (x < 7 && y < 7) ||
              (x > 25 && y < 7) ||
              (x < 7 && y > 25);
            if (!bit && !finder) return null;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="#111"
              />
            );
          })}
        </svg>
      </div>

      <Link href={`/app/${orgSlug}/${projectSlug}`} className="text-sm text-[var(--accent)]">
        Open project →
      </Link>
    </div>
  );
}
