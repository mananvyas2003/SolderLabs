import { getDb } from "@solderlab/db";
import { snapshotToBom, type DesignSnapshot } from "@solderlab/design-core";
import type { ToolHost } from "@solderlab/llm";

export function buildProjectToolHost(opts: {
  headRevisionId: string;
  baseRevisionId?: string | null;
}): ToolHost | null {
  const db = getDb();
  const headRow = db.designSnapshots.find(
    (s) => s.revisionId === opts.headRevisionId,
  );
  if (!headRow) return null;
  const head = JSON.parse(headRow.dataJson) as DesignSnapshot;
  const baseRow = opts.baseRevisionId
    ? db.designSnapshots.find((s) => s.revisionId === opts.baseRevisionId)
    : null;
  const base = baseRow
    ? (JSON.parse(baseRow.dataJson) as DesignSnapshot)
    : null;

  return {
    head,
    base,
    baseRevisionId: opts.baseRevisionId ?? undefined,
    headRevisionId: opts.headRevisionId,
    snapshotFor: (id) => {
      const row = db.designSnapshots.find((s) => s.revisionId === id);
      return row ? (JSON.parse(row.dataJson) as DesignSnapshot) : null;
    },
    checksFor: (revisionId) =>
      db.checkRuns
        .filter((c) => c.revisionId === revisionId)
        .map((c) => ({
          name: c.name,
          status: c.status,
          summary: c.summary,
        })),
    bomRevisionsFor: (revisionId) => {
      const snapRow = db.designSnapshots.find((s) => s.revisionId === revisionId);
      if (!snapRow) return [];
      const snap = JSON.parse(snapRow.dataJson) as DesignSnapshot;
      const rev = db.revisions.find((r) => r.id === revisionId);
      return [
        {
          revisionId,
          createdAt: rev?.createdAt ?? "",
          lines: snapshotToBom(snap).map((l) => ({
            refdes: l.refdes,
            uuid: l.uuid,
            value: l.value,
            footprint: l.footprint,
            mpn: l.mpn ?? null,
            manufacturer: l.manufacturer ?? null,
          })),
        },
      ];
    },
  };
}
