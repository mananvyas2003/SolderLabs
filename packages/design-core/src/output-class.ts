/** Three-class rendering plus refuted. The model cannot assign this. */
export type OutputClass = "verified" | "proposed" | "advisory" | "refuted";

export const ADVISORY_LABEL = "not verified by SolderLabs";

export const ADVISORY_CLAIM_TYPES = [
  "layout_advice",
  "thermal_guess",
  "emi_guess",
  "si_guess",
  "sourcing_speculation",
  "design_intent",
  "manufacturing_process",
] as const;

export type AdvisoryClaimType = (typeof ADVISORY_CLAIM_TYPES)[number];

const ADVISORY_TYPE_SET = new Set<string>(ADVISORY_CLAIM_TYPES);

export function isAdvisoryClaimType(
  type: string | undefined,
): type is AdvisoryClaimType {
  return typeof type === "string" && ADVISORY_TYPE_SET.has(type);
}

export function canGateMerge(outputClass: OutputClass): boolean {
  return outputClass === "verified";
}

export interface ClassifiedSurface {
  class: OutputClass;
  label: string;
  banner: string | null;
  canGateMerge: boolean;
  coverage: number | null;
  verdict: string | null;
  reason: string | null;
  text?: string;
}

export interface ClassifiedProposal extends ClassifiedSurface {
  class: "proposed" | "refuted";
}

export type ClassifyProposalResult =
  | { withheld: true; reason: string }
  | ClassifiedProposal;

function asVerification(raw: unknown): {
  status: string;
  coverage: number;
  refutations: string[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const inner =
    o.verification && typeof o.verification === "object"
      ? (o.verification as Record<string, unknown>)
      : o;
  const status = typeof inner.status === "string" ? inner.status : "";
  if (!status) return null;
  const coverage =
    typeof inner.coverage === "number" && Number.isFinite(inner.coverage)
      ? inner.coverage
      : 0;
  const refutations = Array.isArray(inner.refutations)
    ? inner.refutations.filter((x): x is string => typeof x === "string")
    : [];
  return { status, coverage, refutations };
}

/**
 * Classify a simulate_change / shadow verification.
 * Extra fields from the model (class, canGateMerge, electricalGate) are ignored.
 * Verified engine checks stay on the verification object; the proposal itself
 * is never class "verified" and never gates a merge.
 */
export function classifyProposal(
  raw: unknown,
  _claimed?: Record<string, unknown>,
): ClassifyProposalResult {
  void _claimed;
  const verification = asVerification(raw);
  if (!verification) {
    return { withheld: true, reason: "proposal is not an engine verification" };
  }
  if (verification.status === "unverifiable") {
    return {
      withheld: true,
      reason:
        verification.refutations.join("; ") ||
        "engine could not re-resolve this proposal",
    };
  }
  if (verification.status === "refuted") {
    return {
      class: "refuted",
      label: "Refuted",
      banner: null,
      canGateMerge: false,
      coverage: verification.coverage,
      verdict: verification.status,
      reason:
        verification.refutations.join("; ") || "engine refuted this proposal",
    };
  }
  if (
    verification.status === "verified" ||
    verification.status === "verified_with_warnings"
  ) {
    return {
      class: "proposed",
      label: "Proposed",
      banner: null,
      canGateMerge: false,
      coverage: verification.coverage,
      verdict: verification.status,
      reason: null,
    };
  }
  return { withheld: true, reason: `unknown verification status ${verification.status}` };
}

export function classifyAdvisoryText(text: string): ClassifiedSurface {
  return {
    class: "advisory",
    label: "Advisory",
    banner: ADVISORY_LABEL,
    canGateMerge: false,
    coverage: null,
    verdict: null,
    reason: null,
    text,
  };
}

export function classifyVerifiedEngine(opts: {
  verdict: string;
  coverage?: number | null;
}): ClassifiedSurface {
  return {
    class: "verified",
    label: "Verified",
    banner: null,
    canGateMerge: true,
    coverage: opts.coverage ?? null,
    verdict: opts.verdict,
    reason: null,
  };
}

/** Engine-owned electricalGate copy. Model text cannot supply this. */
export function classifyElectricalGate(
  gate: "PASS" | "FAIL" | null | undefined,
): ClassifiedSurface {
  return classifyVerifiedEngine({
    verdict: gate ?? "n/a",
    coverage: gate ? 1 : null,
  });
}

export function isWithheld(
  row: ClassifyProposalResult,
): row is { withheld: true; reason: string } {
  return "withheld" in row && row.withheld === true;
}
