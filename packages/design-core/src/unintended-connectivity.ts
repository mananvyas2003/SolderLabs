import type { NetDiff } from "./types";
import type { ElectricalChange } from "./semantic-diff";

export interface UnintendedConnectivityFinding {
  net: string;
  kind: NetDiff["kind"];
  message: string;
  beforeNodeCount: number;
  afterNodeCount: number;
}

const NET_TOKEN =
  /\b([A-Z][A-Z0-9_]{1,31}|GND|VCC|VDD|3V3|5V|VBAT|USB_[A-Z0-9_]+)\b/g;

/** Extract likely net / power tokens from a revision message. */
export function extractMentionedNetTokens(message: string | undefined | null): Set<string> {
  const out = new Set<string>();
  if (!message) return out;
  const upper = message.toUpperCase();
  for (const m of upper.matchAll(NET_TOKEN)) {
    out.add(m[1]!);
  }
  // Also allow refdes mentions as "this was intentional around R12"
  for (const m of message.matchAll(/\b([A-Z]{1,3}\d{1,4})\b/g)) {
    out.add(m[1]!.toUpperCase());
  }
  return out;
}

export interface UnintendedDiffSlice {
  nets?: NetDiff[];
  electrical?: { changes: ElectricalChange[] };
}

/**
 * Any net membership add/remove/change not mentioned in the message is "unintended"
 * (or at least unacknowledged) for review highlighting.
 */
export function findUnintendedConnectivity(
  diff: UnintendedDiffSlice,
  revisionMessage?: string | null,
): UnintendedConnectivityFinding[] {
  const mentioned = extractMentionedNetTokens(revisionMessage);
  const findings: UnintendedConnectivityFinding[] = [];

  for (const n of diff.nets ?? []) {
    if (n.kind === "unchanged" || n.kind === "net_renamed") continue;
    // Renames are intentional identity; membership churn is the silent killer
    const nameHit =
      mentioned.has(n.name.toUpperCase()) ||
      (n.beforeName ? mentioned.has(n.beforeName.toUpperCase()) : false);
    if (nameHit) continue;

    const beforeN = n.beforeNodes?.length ?? 0;
    const afterN = n.afterNodes?.length ?? 0;
    findings.push({
      net: n.name,
      kind: n.kind,
      beforeNodeCount: beforeN,
      afterNodeCount: afterN,
      message: `Net ${n.name} ${n.kind} (${beforeN}→${afterN} nodes) without mention in revision message`,
    });
  }

  for (const ch of diff.electrical?.changes ?? []) {
    if (ch.significance === "cosmetic") continue;
    if (!ch.net) continue;
    if (mentioned.has(ch.net.toUpperCase())) continue;
    // Avoid duplexing when already in nets list
    if (findings.some((f) => f.net === ch.net)) continue;
    findings.push({
      net: ch.net,
      kind: "changed",
      beforeNodeCount: 0,
      afterNodeCount: 0,
      message: `Electrical ${ch.type} on ${ch.net} not acknowledged in revision message: ${ch.message}`,
    });
  }

  return findings.sort((a, b) => a.net.localeCompare(b.net));
}
