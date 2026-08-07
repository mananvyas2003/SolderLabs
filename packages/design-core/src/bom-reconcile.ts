/**
 * BOM reconciliation — platform metadata (MPN, alternates, DNP, notes) vs schematic truth.
 * Never writes back to CAD. Flags drift when schematic value/footprint changes but MPN stays.
 */

import type { BomLineLike, SnapshotComponent } from "./types";

export interface BomPlatformMeta {
  /** Component identity — prefer UUID, fall back to refdes */
  uuid?: string;
  refdes: string;
  mpn?: string | null;
  manufacturer?: string | null;
  alternateMpns?: string[];
  dnp?: boolean;
  notes?: string | null;
  /** Schematic fingerprint when meta was last confirmed */
  lockedValue?: string | null;
  lockedFootprint?: string | null;
  lockedLibId?: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

export type BomDriftKind =
  | "value_changed_mpn_stale"
  | "footprint_changed_mpn_stale"
  | "mpn_missing"
  | "dnp_but_populated_in_cad"
  | "cad_refdes_missing";

export interface BomDriftFinding {
  kind: BomDriftKind;
  refdes: string;
  uuid?: string;
  message: string;
  schematicValue?: string;
  schematicFootprint?: string;
  platformMpn?: string | null;
}

function keyOf(c: { uuid?: string; refdes: string }): string {
  return c.uuid ? `uuid:${c.uuid}` : `ref:${c.refdes}`;
}

/**
 * Compare schematic components (+ derived BOM) against platform-owned BOM metadata.
 */
export function reconcileBom(
  schematicComponents: SnapshotComponent[],
  platform: BomPlatformMeta[],
): BomDriftFinding[] {
  const findings: BomDriftFinding[] = [];
  const byKey = new Map(platform.map((p) => [keyOf(p), p]));
  const byRef = new Map(platform.map((p) => [p.refdes, p]));

  for (const c of schematicComponents) {
    const meta = (c.uuid ? byKey.get(`uuid:${c.uuid}`) : undefined) ?? byRef.get(c.refdes);
    if (!meta) {
      // No platform override — soft: only flag missing MPN on the CAD itself
      if (!c.mpn) {
        findings.push({
          kind: "mpn_missing",
          refdes: c.refdes,
          uuid: c.uuid,
          message: `${c.refdes} has no MPN in schematic and no platform BOM override`,
          schematicValue: c.value,
          schematicFootprint: c.footprint,
        });
      }
      continue;
    }

    if (meta.dnp) {
      findings.push({
        kind: "dnp_but_populated_in_cad",
        refdes: c.refdes,
        uuid: c.uuid,
        message: `${c.refdes} is DNP in platform BOM but still present in schematic`,
        platformMpn: meta.mpn,
      });
    }

    if (
      meta.mpn &&
      meta.lockedValue != null &&
      meta.lockedValue !== c.value
    ) {
      findings.push({
        kind: "value_changed_mpn_stale",
        refdes: c.refdes,
        uuid: c.uuid,
        message: `${c.refdes} value changed (${meta.lockedValue} → ${c.value}) but platform MPN is still ${meta.mpn}`,
        schematicValue: c.value,
        schematicFootprint: c.footprint,
        platformMpn: meta.mpn,
      });
    }

    if (
      meta.mpn &&
      meta.lockedFootprint != null &&
      meta.lockedFootprint !== c.footprint
    ) {
      findings.push({
        kind: "footprint_changed_mpn_stale",
        refdes: c.refdes,
        uuid: c.uuid,
        message: `${c.refdes} footprint changed (${meta.lockedFootprint} → ${c.footprint}) but platform MPN is still ${meta.mpn}`,
        schematicValue: c.value,
        schematicFootprint: c.footprint,
        platformMpn: meta.mpn,
      });
    }

    if (!meta.mpn && !c.mpn) {
      findings.push({
        kind: "mpn_missing",
        refdes: c.refdes,
        uuid: c.uuid,
        message: `${c.refdes} has no MPN in schematic or platform BOM`,
        schematicValue: c.value,
        schematicFootprint: c.footprint,
      });
    }
  }

  for (const meta of platform) {
    const stillInCad = schematicComponents.some(
      (c) =>
        (meta.uuid && c.uuid === meta.uuid) || c.refdes === meta.refdes,
    );
    if (!stillInCad && !meta.dnp) {
      findings.push({
        kind: "cad_refdes_missing",
        refdes: meta.refdes,
        uuid: meta.uuid,
        message: `Platform BOM line ${meta.refdes} has no matching schematic component (consider DNP or remove)`,
        platformMpn: meta.mpn,
      });
    }
  }

  return findings;
}

/** Merge CAD BOM with platform overrides for display (CAD value/footprint win). */
export function mergeBomDisplay(
  cadBom: BomLineLike[],
  platform: BomPlatformMeta[],
): Array<
  BomLineLike & {
    platformMpn?: string | null;
    dnp?: boolean;
    notes?: string | null;
    alternates?: string[];
  }
> {
  const byRef = new Map(platform.map((p) => [p.refdes, p]));
  return cadBom.map((line) => {
    const meta = byRef.get(line.refdes);
    return {
      ...line,
      mpn: meta?.mpn ?? line.mpn,
      manufacturer: meta?.manufacturer ?? line.manufacturer,
      platformMpn: meta?.mpn,
      dnp: meta?.dnp,
      notes: meta?.notes,
      alternates: meta?.alternateMpns,
    };
  });
}
