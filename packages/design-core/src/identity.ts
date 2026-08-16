import type { SnapshotComponent } from "./types";

/** How a base↔head component pair was matched. */
export type IdentityTier = "uuid" | "sheet_refdes" | "refdes";

export interface IdentityMatch {
  base: SnapshotComponent;
  head: SnapshotComponent;
  tier: IdentityTier;
}

export interface IdentityResolveResult {
  matched: IdentityMatch[];
  baseOnly: SnapshotComponent[];
  headOnly: SnapshotComponent[];
  /** Count of matched pairs per resolution tier. */
  tierCounts: Record<IdentityTier, number>;
  /** Fraction of matched pairs resolved via KiCad UUID (0–1). */
  uuidCoverage: number;
}

function sheetRefdesKey(c: SnapshotComponent): string {
  return `${c.boardKey ?? ""}\u0000${c.sheetPath ?? c.sheetId}\u0000${c.refdes}`;
}

/**
 * Match key for tier-1 KiCad identity. Multi-instance subsheets share a
 * symbol UUID in the child file — disambiguate with sheetPath when present.
 */
function uuidIdentityKey(c: SnapshotComponent): string | undefined {
  const u = c.uuid?.trim();
  if (!u) return undefined;
  const board = c.boardKey ?? "";
  if (c.sheetPath) return `${board}\u0000${c.sheetPath}\u0000${u}`;
  return `${board}\u0000${u}`;
}

/**
 * Match components base→head using strict identity order:
 * (1) KiCad UUID, (2) sheet path + refdes, (3) refdes alone.
 * Never matches on value or footprint.
 */
export function resolveIdentity(
  base: SnapshotComponent[],
  head: SnapshotComponent[],
): IdentityResolveResult {
  const matched: IdentityMatch[] = [];
  const baseRemaining = new Set(base);
  const headRemaining = new Set(head);

  const claim = (
    b: SnapshotComponent,
    h: SnapshotComponent,
    tier: IdentityTier,
  ) => {
    if (!baseRemaining.has(b) || !headRemaining.has(h)) return false;
    baseRemaining.delete(b);
    headRemaining.delete(h);
    matched.push({ base: b, head: h, tier });
    return true;
  };

  // Tier 1 — KiCad UUID (path-qualified when hierarchical)
  const headByUuid = new Map<string, SnapshotComponent[]>();
  for (const h of head) {
    const u = uuidIdentityKey(h);
    if (!u) continue;
    const list = headByUuid.get(u) ?? [];
    list.push(h);
    headByUuid.set(u, list);
  }
  for (const b of [...baseRemaining]) {
    const u = uuidIdentityKey(b);
    if (!u) continue;
    const candidates = headByUuid.get(u);
    if (!candidates?.length) continue;
    const h = candidates.shift()!;
    if (candidates.length === 0) headByUuid.delete(u);
    claim(b, h, "uuid");
  }

  // Tier 2 — hierarchical sheet path + refdes
  const headBySheetRef = new Map<string, SnapshotComponent[]>();
  for (const h of headRemaining) {
    const k = sheetRefdesKey(h);
    const list = headBySheetRef.get(k) ?? [];
    list.push(h);
    headBySheetRef.set(k, list);
  }
  for (const b of [...baseRemaining]) {
    const k = sheetRefdesKey(b);
    const candidates = headBySheetRef.get(k);
    if (!candidates?.length) continue;
    const h = candidates.shift()!;
    if (candidates.length === 0) headBySheetRef.delete(k);
    claim(b, h, "sheet_refdes");
  }

  // Tier 3 — refdes alone (within the same board)
  const headByRef = new Map<string, SnapshotComponent[]>();
  for (const h of headRemaining) {
    const k = `${h.boardKey ?? ""}\u0000${h.refdes}`;
    const list = headByRef.get(k) ?? [];
    list.push(h);
    headByRef.set(k, list);
  }
  for (const b of [...baseRemaining]) {
    const candidates = headByRef.get(`${b.boardKey ?? ""}\u0000${b.refdes}`);
    if (!candidates?.length) continue;
    const h = candidates.shift()!;
    if (candidates.length === 0) headByRef.delete(b.refdes);
    claim(b, h, "refdes");
  }

  const tierCounts: Record<IdentityTier, number> = {
    uuid: 0,
    sheet_refdes: 0,
    refdes: 0,
  };
  for (const m of matched) tierCounts[m.tier]++;

  const uuidCoverage =
    matched.length === 0 ? 0 : tierCounts.uuid / matched.length;

  return {
    matched,
    baseOnly: [...baseRemaining],
    headOnly: [...headRemaining],
    tierCounts,
    uuidCoverage,
  };
}

/** Human-readable tier breakdown for coverage reports / logs. */
export function formatIdentityCoverage(result: IdentityResolveResult): string {
  const { tierCounts, matched, uuidCoverage } = result;
  return [
    `identity matches=${matched.length}`,
    `uuid=${tierCounts.uuid}`,
    `sheet_refdes=${tierCounts.sheet_refdes}`,
    `refdes=${tierCounts.refdes}`,
    `uuid_coverage=${(uuidCoverage * 100).toFixed(1)}%`,
    `base_only=${result.baseOnly.length}`,
    `head_only=${result.headOnly.length}`,
  ].join(" ");
}
