import type { DesignSnapshot, SnapshotComponent, SnapshotNet } from "./types.ts";
import type { BomPlatformMeta } from "./bom-reconcile.ts";

const POWER_PIN_RE =
  /\b(VDD|VCC|AVCC|AVDD|VIN|VDDIO|VBAT|VCORE|VDDQ|VDD_\w+)\b/i;
const ANON_NET_RE = /^N\$|^Net-\(/i;
const PASSIVE_REF_RE = /^(R|C|L|D|FB|F|BEAD|RN|RP|#PWR|#FLG|#E|#U)/i;
const CAP_REF_RE = /^C\d/i;
const TP_REF_RE = /^TP/i;

export function isPowerOrGroundNet(net: SnapshotNet): boolean {
  if (net.class === "power" || net.class === "ground") return true;
  return /^(GND|AGND|PGND|DGND|VSS|VCC|VDD|VBUS|VBAT|\+[0-9]|[0-9]+V)/i.test(
    net.name,
  );
}

export function isAnonymousNetName(name: string): boolean {
  return !name.trim() || ANON_NET_RE.test(name);
}

function pinNets(c: SnapshotComponent): Set<string> {
  const nets = new Set<string>();
  for (const p of c.pins ?? []) {
    if (p.net) nets.add(p.net);
  }
  return nets;
}

function parseCapFarads(value: string): number | null {
  const v = value.trim().replace(/\s+/g, "");
  const m = v.match(/^([0-9]+(?:[.,][0-9]+)?)([pnuµmk]?F?)$/i);
  if (!m) return null;
  const mag = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(mag)) return null;
  const u = (m[2] ?? "").toLowerCase();
  if (u.startsWith("p")) return mag * 1e-12;
  if (u.startsWith("n")) return mag * 1e-9;
  if (u.startsWith("u") || u.startsWith("µ")) return mag * 1e-6;
  if (u.startsWith("k") || u.startsWith("m")) return mag * 1e-3;
  if (u === "f" || u === "") return mag > 1 ? mag * 1e-12 : mag * 1e-6;
  return null;
}

export interface DecouplingCap {
  refdes: string;
  value: string;
  nets: string[];
  farads: number | null;
}

/** Caps that share at least one net with refdes. Does not invent values. */
export function listDecouplingForRefdes(
  snapshot: DesignSnapshot,
  refdes: string,
): {
  refdes: string;
  nets: string[];
  capacitors: DecouplingCap[];
} | { error: string; refdes: string } {
  const target = snapshot.components.find((c) => c.refdes === refdes);
  if (!target) return { error: "component not found", refdes };
  const nets = pinNets(target);
  const capacitors: DecouplingCap[] = [];
  for (const other of snapshot.components) {
    if (other.refdes === refdes) continue;
    if (!CAP_REF_RE.test(other.refdes)) continue;
    const shared = [...pinNets(other)].filter((n) => nets.has(n));
    if (!shared.length) continue;
    capacitors.push({
      refdes: other.refdes,
      value: other.value,
      nets: shared.sort(),
      farads: parseCapFarads(other.value),
    });
  }
  return { refdes, nets: [...nets].sort(), capacitors };
}

export interface SubstitutionCandidate {
  mpn: string;
  source: "library" | "board";
  refdes?: string;
}

export interface SubstitutionRow {
  refdes: string;
  value: string;
  footprint: string;
  mpn: string | null;
  pinCount: number;
  nets: string[];
  candidates: SubstitutionCandidate[];
  status: "verified" | "unverifiable";
  reason: string | null;
}

function isIcLike(c: SnapshotComponent): boolean {
  if (PASSIVE_REF_RE.test(c.refdes) || TP_REF_RE.test(c.refdes)) return false;
  if (/^(J|P|X|CON|SW|Y)\d/i.test(c.refdes)) return false;
  return true;
}

/**
 * B1 — substitution candidates from library alternates or an identical
 * value+footprint already on the board. Never invents an MPN.
 */
export function auditSubstitutions(
  snapshot: DesignSnapshot,
  platform: BomPlatformMeta[] = [],
  refdes?: string,
): SubstitutionRow[] {
  const byRef = new Map(platform.map((p) => [p.refdes, p]));
  const targets = snapshot.components.filter((c) =>
    refdes ? c.refdes === refdes : isIcLike(c),
  );
  const rows: SubstitutionRow[] = [];
  for (const c of targets) {
    const meta = byRef.get(c.refdes);
    const candidates: SubstitutionCandidate[] = [];
    const seen = new Set<string>();
    const add = (mpn: string, source: SubstitutionCandidate["source"], from?: string) => {
      const key = mpn.trim();
      if (!key || seen.has(key)) return;
      if (c.mpn && key === c.mpn) return;
      seen.add(key);
      candidates.push({ mpn: key, source, refdes: from });
    };
    for (const alt of meta?.alternateMpns ?? []) add(alt, "library");
    for (const other of snapshot.components) {
      if (other.refdes === c.refdes) continue;
      if (other.value !== c.value || other.footprint !== c.footprint) continue;
      if (other.mpn) add(other.mpn, "board", other.refdes);
    }
    const status = candidates.length ? "verified" : "unverifiable";
    rows.push({
      refdes: c.refdes,
      value: c.value,
      footprint: c.footprint,
      mpn: c.mpn ?? meta?.mpn ?? null,
      pinCount: c.pins?.length ?? 0,
      nets: [...pinNets(c)].sort(),
      candidates,
      status,
      reason: candidates.length
        ? null
        : "No library alternates and no same value/footprint MPN on the board",
    });
  }
  return rows.sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );
}

export interface DecouplingGap {
  refdes: string;
  pin: string;
  pinName: string;
  net: string;
}

export interface DecouplingAudit {
  rails: Array<{ net: string; capacitors: string[] }>;
  gaps: DecouplingGap[];
  coverage: number;
}

/**
 * B2 — which IC power pins sit on a net with no capacitor.
 * Does not recommend a capacitance.
 */
export function auditDecoupling(snapshot: DesignSnapshot): DecouplingAudit {
  const capsByNet = new Map<string, string[]>();
  for (const c of snapshot.components) {
    if (!CAP_REF_RE.test(c.refdes)) continue;
    for (const net of pinNets(c)) {
      const list = capsByNet.get(net) ?? [];
      list.push(c.refdes);
      capsByNet.set(net, list);
    }
  }
  const rails = snapshot.nets.filter(isPowerOrGroundNet).map((n) => ({
    net: n.name,
    capacitors: [...new Set(capsByNet.get(n.name) ?? [])].sort(),
  }));
  const gaps: DecouplingGap[] = [];
  for (const c of snapshot.components) {
    if (!isIcLike(c)) continue;
    for (const p of c.pins ?? []) {
      if (!POWER_PIN_RE.test(p.name) || !p.net) continue;
      if (capsByNet.has(p.net)) continue;
      gaps.push({
        refdes: c.refdes,
        pin: p.number,
        pinName: p.name,
        net: p.net,
      });
    }
  }
  const powerPins = snapshot.components
    .filter(isIcLike)
    .flatMap((c) =>
      (c.pins ?? []).filter((p) => POWER_PIN_RE.test(p.name) && p.net),
    );
  const coverage =
    powerPins.length === 0 ? 1 : 1 - gaps.length / powerPins.length;
  return {
    rails,
    gaps,
    coverage: Math.round(coverage * 1e6) / 1e6,
  };
}

export interface TestPointCoverage {
  covered: Array<{ net: string; testPoints: string[] }>;
  uncovered: string[];
  coverage: number;
}

/**
 * B3 — power/ground nets that already have a TP* on them.
 */
export function auditTestPointCoverage(snapshot: DesignSnapshot): TestPointCoverage {
  const tpByNet = new Map<string, string[]>();
  for (const c of snapshot.components) {
    if (!TP_REF_RE.test(c.refdes)) continue;
    for (const net of pinNets(c)) {
      const list = tpByNet.get(net) ?? [];
      list.push(c.refdes);
      tpByNet.set(net, list);
    }
  }
  const priority = snapshot.nets.filter(isPowerOrGroundNet);
  const covered: TestPointCoverage["covered"] = [];
  const uncovered: string[] = [];
  for (const n of priority) {
    const tps = [...new Set(tpByNet.get(n.name) ?? [])].sort();
    if (tps.length) covered.push({ net: n.name, testPoints: tps });
    else uncovered.push(n.name);
  }
  const coverage =
    priority.length === 0 ? 1 : covered.length / priority.length;
  return {
    covered,
    uncovered: uncovered.sort(),
    coverage: Math.round(coverage * 1e6) / 1e6,
  };
}

export interface NetNamingRow {
  name: string;
  nodes: string[];
  pinNames: string[];
  derivedFromPins: string | null;
}

export interface NetNamingAudit {
  anonymous: NetNamingRow[];
  coverage: number;
}

/**
 * B4 — anonymous nets plus pin names already on them.
 * A derived name is emitted only when every named pin agrees.
 */
export function auditNetNames(snapshot: DesignSnapshot): NetNamingAudit {
  const pinNameByNode = new Map<string, string>();
  for (const c of snapshot.components) {
    for (const p of c.pins ?? []) {
      pinNameByNode.set(`${c.refdes}.${p.number}`, p.name);
    }
  }
  const anonymous: NetNamingRow[] = [];
  for (const n of snapshot.nets) {
    if (!isAnonymousNetName(n.name)) continue;
    const pinNames = n.nodes
      .map((node) => pinNameByNode.get(node))
      .filter((name): name is string => Boolean(name) && name !== "~");
    const uniq = [...new Set(pinNames)];
    anonymous.push({
      name: n.name,
      nodes: [...n.nodes].sort(),
      pinNames: uniq.sort(),
      derivedFromPins: uniq.length === 1 ? uniq[0]! : null,
    });
  }
  const coverage =
    snapshot.nets.length === 0
      ? 1
      : 1 - anonymous.length / snapshot.nets.length;
  return {
    anonymous,
    coverage: Math.round(coverage * 1e6) / 1e6,
  };
}
