"use client";

import type { ClassifiedProposal, OutputClass } from "@solderlab/design-core";
import { Badge } from "@solderlab/ui";

const TONE: Record<
  OutputClass,
  "success" | "accent" | "warn" | "danger"
> = {
  verified: "success",
  proposed: "accent",
  advisory: "warn",
  refuted: "danger",
};

export function ClassBadge({ outputClass }: { outputClass: OutputClass }) {
  const label =
    outputClass === "verified"
      ? "Verified"
      : outputClass === "proposed"
        ? "Proposed"
        : outputClass === "refuted"
          ? "Refuted"
          : "Advisory";
  return <Badge tone={TONE[outputClass]}>{label}</Badge>;
}

export function AdvisoryBanner() {
  return (
    <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
      Advisory — not verified by SolderLabs. Cannot change electricalGate,
      checks, or merge eligibility.
    </p>
  );
}

export function ProposalCard({ proposal }: { proposal: ClassifiedProposal }) {
  const pct =
    proposal.coverage == null
      ? null
      : `${Math.round(proposal.coverage * 100)}%`;
  return (
    <article className="border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ClassBadge outputClass={proposal.class} />
        {proposal.verdict ? (
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            verdict {proposal.verdict}
          </span>
        ) : null}
        {pct ? (
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            coverage {pct}
          </span>
        ) : null}
      </div>
      {proposal.reason ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
          {proposal.reason}
        </p>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Engine-checked proposal. Does not gate merge. Apply the change in
          KiCad.
        </p>
      )}
    </article>
  );
}
