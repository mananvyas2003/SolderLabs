/**
 * Per-line BOM history — `git blame` for a BOM line across revisions.
 * Prefer UUID identity; fall back to refdes.
 */

export interface BomHistoryRevisionLine {
  revisionId: string;
  createdAt: string;
  authorId?: string;
  authorName?: string;
  message?: string;
  reviewId?: string | null;
  /** Component / line snapshot at this revision */
  refdes: string;
  uuid?: string;
  value: string;
  footprint: string;
  mpn?: string | null;
  manufacturer?: string | null;
}

export interface BomBlameEvent {
  revisionId: string;
  createdAt: string;
  authorId?: string;
  authorName?: string;
  message?: string;
  reviewId?: string | null;
  refdes: string;
  uuid?: string;
  /** Fields that changed at this revision vs previous */
  changedFields: string[];
  before?: Partial<BomHistoryRevisionLine>;
  after: Partial<BomHistoryRevisionLine>;
}

function fingerprint(line: BomHistoryRevisionLine): string {
  return [
    line.refdes,
    line.value,
    line.footprint,
    line.mpn ?? "",
    line.manufacturer ?? "",
  ].join("|");
}

function fieldDiff(
  a: BomHistoryRevisionLine | undefined,
  b: BomHistoryRevisionLine,
): string[] {
  if (!a) return ["added"];
  const fields: Array<keyof BomHistoryRevisionLine> = [
    "refdes",
    "value",
    "footprint",
    "mpn",
    "manufacturer",
  ];
  return fields.filter((f) => String(a[f] ?? "") !== String(b[f] ?? ""));
}

/**
 * Build blame timeline for one identity (uuid or refdes) from chronologically
 * ordered revision lines (oldest → newest).
 */
export function blameBomLine(
  timeline: BomHistoryRevisionLine[],
): BomBlameEvent[] {
  const events: BomBlameEvent[] = [];
  let prev: BomHistoryRevisionLine | undefined;
  for (const cur of timeline) {
    if (prev && fingerprint(prev) === fingerprint(cur)) {
      prev = cur;
      continue;
    }
    const changed = fieldDiff(prev, cur);
    if (!changed.length) {
      prev = cur;
      continue;
    }
    events.push({
      revisionId: cur.revisionId,
      createdAt: cur.createdAt,
      authorId: cur.authorId,
      authorName: cur.authorName,
      message: cur.message,
      reviewId: cur.reviewId,
      refdes: cur.refdes,
      uuid: cur.uuid,
      changedFields: changed,
      before: prev
        ? {
            value: prev.value,
            footprint: prev.footprint,
            mpn: prev.mpn,
            manufacturer: prev.manufacturer,
            refdes: prev.refdes,
          }
        : undefined,
      after: {
        value: cur.value,
        footprint: cur.footprint,
        mpn: cur.mpn,
        manufacturer: cur.manufacturer,
        refdes: cur.refdes,
      },
    });
    prev = cur;
  }
  return events;
}

/**
 * Group all BOM lines across revisions into blame maps keyed by uuid||refdes.
 * `revisions` must be oldest → newest.
 */
export function blameAllBomLines(
  revisions: Array<{
    revisionId: string;
    createdAt: string;
    authorId?: string;
    authorName?: string;
    message?: string;
    reviewId?: string | null;
    lines: Array<{
      refdes: string;
      uuid?: string;
      value: string;
      footprint: string;
      mpn?: string | null;
      manufacturer?: string | null;
    }>;
  }>,
): Map<string, BomBlameEvent[]> {
  const keys = new Set<string>();
  for (const rev of revisions) {
    for (const l of rev.lines) {
      keys.add(l.uuid ? `uuid:${l.uuid}` : `ref:${l.refdes}`);
    }
  }
  const out = new Map<string, BomBlameEvent[]>();
  for (const key of keys) {
    const timeline: BomHistoryRevisionLine[] = [];
    for (const rev of revisions) {
      const line = rev.lines.find((l) =>
        key.startsWith("uuid:")
          ? l.uuid === key.slice(5)
          : l.refdes === key.slice(4),
      );
      if (!line) continue;
      timeline.push({
        revisionId: rev.revisionId,
        createdAt: rev.createdAt,
        authorId: rev.authorId,
        authorName: rev.authorName,
        message: rev.message,
        reviewId: rev.reviewId,
        ...line,
      });
    }
    out.set(key, blameBomLine(timeline));
  }
  return out;
}
