import type { OutputClass } from "@solderlab/design-core";
import {
  canGateMerge,
  classifyProposal,
  classifyVerifiedEngine,
  isWithheld,
  type ClassifiedSurface,
} from "@solderlab/design-core";
import type { PhysicsFinding, PhysicsResponse } from "./types.ts";

/** Engine-templated prose — never uses model free text. */
export function renderPhysicsFindingText(f: PhysicsFinding): string {
  const t = f.textTemplateFields ?? {};
  switch (f.type) {
    case "voltage_result": {
      const probe = String(t.probe ?? "node");
      const v = t.voltage;
      if (typeof t.expected === "number" && typeof v === "number") {
        return `Engine DC solve: ${probe} = ${Number(v).toFixed(3)} V (expected ${Number(t.expected).toFixed(3)} V).`;
      }
      return typeof v === "number"
        ? `Engine DC solve: ${probe} = ${Number(v).toFixed(3)} V.`
        : `Engine DC solve reported ${probe}.`;
    }
    case "power_dissipation": {
      const role = String(t.role ?? t.refdes ?? "component");
      const p = t.power_w;
      return typeof p === "number"
        ? `Engine power on ${role}: ${Number(p).toFixed(4)} W.`
        : `Engine power check for ${role}.`;
    }
    case "design_equation": {
      const role = String(t.role ?? "role");
      const mpn = String(t.mpn ?? "");
      const value = t.value;
      const bound = t.bound === true;
      if (bound && mpn) {
        return `Topology role ${role} bound to ${mpn}` +
          (typeof value === "number" ? ` (value ${value}).` : ".");
      }
      return `Topology role ${role} unbound — constraints not satisfied.`;
    }
    case "part_rating_risk": {
      if (t.reason === "singular_matrix") {
        return "Engine refuted circuit: singular MNA matrix (floating node or malformed stamps).";
      }
      return `Part rating risk: ${String(t.reason ?? "constraint failure")}.`;
    }
    default:
      return `Engine finding (${f.type}).`;
  }
}

export function renderPhysicsFindings(res: PhysicsResponse): string[] {
  return (res.findings ?? []).map(renderPhysicsFindingText);
}

/**
 * Map engine status to UI classification.
 * - solve_dc verified → verified engine surface (can gate merge for that check)
 * - synthesize verified → always Proposed (bindings-only, no CAD write)
 * - refuted / unverifiable → as named
 */
export function classifyPhysicsResponse(
  res: PhysicsResponse,
  kind: "solve_dc" | "synthesize" | "find_candidates" | "other" = "other",
): ClassifiedSurface | { withheld: true; reason: string } {
  if (kind === "synthesize" && res.status === "verified") {
    return {
      class: "proposed" as OutputClass,
      label: "Proposed",
      banner: null,
      canGateMerge: false,
      coverage: 1,
      verdict: "bindings_only",
      reason:
        "Topology bindings are Proposed until a human applies them in KiCad",
      text: renderPhysicsFindings(res).join(" "),
    };
  }
  if (res.status === "verified") {
    return classifyVerifiedEngine({
      verdict: kind === "solve_dc" ? "physics_dc_ok" : "physics_ok",
      coverage: 1,
    });
  }
  if (res.status === "refuted") {
    const shadow = classifyProposal({
      verification: {
        status: "refuted",
        coverage: 1,
        refutations: res.errors.length
          ? res.errors
          : renderPhysicsFindings(res),
      },
    });
    if (isWithheld(shadow)) return shadow;
    return shadow;
  }
  return {
    withheld: true as const,
    reason: res.errors.join("; ") || "physics engine unverifiable",
  };
}

export function physicsCanGateMerge(surface: ClassifiedSurface): boolean {
  return canGateMerge(surface.class);
}
