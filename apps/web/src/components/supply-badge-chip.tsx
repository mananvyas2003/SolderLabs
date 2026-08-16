"use client";

import { supplyBadgeClass, type SupplyBadge } from "@/lib/supply-badge";

export function SupplyBadgeChip({ badge }: { badge: SupplyBadge }) {
  return (
    <span
      className={`inline-flex flex-col rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${supplyBadgeClass(badge.level)}`}
      title={
        badge.lastCheckedAt
          ? `lastCheckedAt ${badge.lastCheckedAt}`
          : "never checked"
      }
    >
      <span>{badge.label}</span>
      <span className="normal-case tracking-normal opacity-80">
        {badge.lastCheckedAt
          ? `checked ${badge.lastCheckedAt}`
          : "never checked"}
      </span>
    </span>
  );
}
