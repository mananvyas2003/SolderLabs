import type { DesignSnapshot } from "@solderlab/design-core";
import { generateBSC } from "@solderlab/bsc";
import { sanitizeUntrustedValue } from "./sanitize.ts";

const TARGET_BYTES = 2048;

export interface BoardCardRail {
  name: string;
  nodes: string[];
}

export interface BoardCard {
  board: string;
  revision: string;
  components: string[];
  nets: string[];
  sheets: string[];
  mcus: string[];
  rails: BoardCardRail[];
  parseStatus: string;
  warnings: string[];
}

function capList(items: string[], max: number): string[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `…+${items.length - max}`];
}

export function buildBoardCard(
  snapshot: DesignSnapshot,
  opts: { board?: string; revision?: string } = {},
): BoardCard {
  const bsc = generateBSC(snapshot, {
    boardName: opts.board,
    revisionId: opts.revision ?? null,
  });
  const rails: BoardCardRail[] = bsc.powerRails.slice(0, 12).map((r) => {
    const net = snapshot.nets.find((n) => n.name === r.name);
    return { name: r.name, nodes: (net?.nodes ?? []).slice(0, 8) };
  });
  const card: BoardCard = {
    board: opts.board ?? snapshot.meta.projectRoot ?? "board",
    revision: opts.revision ?? "",
    components: capList(
      snapshot.components.map((c) => c.refdes),
      48,
    ),
    nets: capList(
      snapshot.nets.map((n) => n.name),
      48,
    ),
    sheets: capList(
      snapshot.sheets.map((s) => s.name ?? s.id),
      16,
    ),
    mcus: bsc.mcus.map((m) => m.refdes),
    rails,
    parseStatus: snapshot.parseStatus ?? "ok",
    warnings: (snapshot.warnings ?? []).map((w) => w.message).slice(0, 8),
  };
  return shrinkToBudget(card);
}

function shrinkToBudget(card: BoardCard): BoardCard {
  let next = card;
  while (JSON.stringify(next).length > TARGET_BYTES) {
    if (next.components.length > 8) {
      next = { ...next, components: capList(next.components, Math.max(8, next.components.length - 8)) };
      continue;
    }
    if (next.nets.length > 8) {
      next = { ...next, nets: capList(next.nets, Math.max(8, next.nets.length - 8)) };
      continue;
    }
    if (next.rails.length > 4) {
      next = { ...next, rails: next.rails.slice(0, next.rails.length - 1) };
      continue;
    }
    break;
  }
  return sanitizeUntrustedValue(next) as BoardCard;
}

export function boardCardBytes(card: BoardCard): number {
  return new TextEncoder().encode(JSON.stringify(card)).length;
}
