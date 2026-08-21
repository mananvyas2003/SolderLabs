import type { ShadowSnapshot, VerificationResult } from "@solderlab/design-core";
import { solveDc } from "./client.ts";
import { renderPhysicsFindings } from "./classify.ts";
import type { PhysicsStamp } from "./types.ts";

/**
 * Optional DC check for a hand-stamped netlist attached to a shadow.
 * Singular / floating → refuted. Does not invent stamps from CAD.
 */
export function enrichShadowWithDcSolve(
  shadow: ShadowSnapshot,
  args: { nodes: number; stamps: PhysicsStamp[]; probes?: { name: string; node: number; expected?: number }[] },
): ShadowSnapshot {
  const res = solveDc(args);
  const verification: VerificationResult = { ...shadow.verification };
  if (res.status === "refuted") {
    verification.status = "refuted";
    verification.refutations = [
      ...verification.refutations,
      ...res.errors,
      ...renderPhysicsFindings(res),
    ];
    verification.checkDeltas = [
      ...verification.checkDeltas,
      { name: "physics-dc", before: "n/a", after: "fail" },
    ];
  } else if (res.status === "verified") {
    verification.checkDeltas = [
      ...verification.checkDeltas,
      { name: "physics-dc", before: "n/a", after: "pass" },
    ];
  } else {
    verification.refutations = [
      ...verification.refutations,
      ...res.errors,
    ];
  }
  return { ...shadow, verification };
}
