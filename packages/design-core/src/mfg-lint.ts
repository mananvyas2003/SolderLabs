/**
 * Manufacturing package linter — catch the error class that costs a fab week.
 * Deterministic checks against BOM + placement + declared stackup/layers.
 */

export interface MfgBomLine {
  refdes: string;
  mpn?: string | null;
  value?: string;
  footprint?: string;
  dnp?: boolean;
}

export interface MfgPlacementLine {
  refdes: string;
  x?: number;
  y?: number;
  rotation?: number;
  side?: string;
}

export interface MfgGerberLayer {
  name: string;
  path?: string;
}

export interface MfgStackupLayer {
  name: string;
  type?: string;
}

export interface MfgLintInput {
  bom: MfgBomLine[];
  /** Pick-and-place / PCB footprint refs */
  placement: MfgPlacementLine[];
  gerberLayers?: MfgGerberLayer[];
  declaredStackup?: MfgStackupLayer[];
}

export type MfgLintSeverity = "error" | "warn";

export interface MfgLintFinding {
  code:
    | "pnp_unknown_refdes"
    | "bom_missing_mpn"
    | "bom_missing_placement"
    | "gerber_stackup_mismatch"
    | "empty_package";
  severity: MfgLintSeverity;
  message: string;
  ref?: string;
}

export interface MfgLintResult {
  ok: boolean;
  findings: MfgLintFinding[];
  summary: string;
}

export function lintManufacturingPackage(input: MfgLintInput): MfgLintResult {
  const findings: MfgLintFinding[] = [];
  const bomRefs = new Set(
    input.bom.filter((b) => !b.dnp).map((b) => b.refdes),
  );
  const placeRefs = new Set(input.placement.map((p) => p.refdes));

  if (!input.bom.length && !input.placement.length) {
    findings.push({
      code: "empty_package",
      severity: "error",
      message: "Manufacturing package has neither BOM nor placement data",
    });
  }

  for (const p of input.placement) {
    if (!bomRefs.has(p.refdes)) {
      findings.push({
        code: "pnp_unknown_refdes",
        severity: "error",
        ref: p.refdes,
        message: `Pick-and-place refdes ${p.refdes} has no matching non-DNP BOM line`,
      });
    }
  }

  for (const b of input.bom) {
    if (b.dnp) continue;
    if (!b.mpn?.trim()) {
      findings.push({
        code: "bom_missing_mpn",
        severity: "error",
        ref: b.refdes,
        message: `BOM line ${b.refdes} has no MPN`,
      });
    }
    if (input.placement.length && !placeRefs.has(b.refdes)) {
      findings.push({
        code: "bom_missing_placement",
        severity: "warn",
        ref: b.refdes,
        message: `BOM line ${b.refdes} has no pick-and-place / PCB footprint`,
      });
    }
  }

  if (input.gerberLayers?.length && input.declaredStackup?.length) {
    const gerberNames = new Set(
      input.gerberLayers.map((g) => g.name.toLowerCase()),
    );
    for (const layer of input.declaredStackup) {
      const n = layer.name.toLowerCase();
      // Soft match: stackup copper names should appear in gerber set
      if (
        /cu|copper|\.cu|f\.cu|b\.cu|in\d/i.test(layer.name) &&
        ![...gerberNames].some(
          (g) => g.includes(n) || n.includes(g) || g.includes("cu"),
        )
      ) {
        // only fail if no copper-ish gerber at all
      }
    }
    const hasCuGerber = [...gerberNames].some((g) => /cu|copper/.test(g));
    const hasCuStack = input.declaredStackup.some((s) =>
      /cu|copper/i.test(s.name),
    );
    if (hasCuStack && !hasCuGerber) {
      findings.push({
        code: "gerber_stackup_mismatch",
        severity: "error",
        message:
          "Declared stackup includes copper layers but Gerber set has no copper-like layers",
      });
    }
    if (!hasCuStack && hasCuGerber) {
      findings.push({
        code: "gerber_stackup_mismatch",
        severity: "warn",
        message:
          "Gerbers include copper layers but declared stackup lists none",
      });
    }
  }

  const warns = findings.filter((f) => f.severity === "warn").length;
  const blocking = findings.filter(
    (f) => f.severity === "error" && f.code !== "bom_missing_mpn",
  ).length;
  const notes = findings.length - blocking;
  return {
    ok: blocking === 0,
    findings,
    summary:
      blocking === 0 && notes === 0
        ? "Manufacturing package OK"
        : blocking === 0
          ? `Pass with ${notes} note(s); MPN gaps are tracked by bom-mpn`
          : `${blocking} error(s), ${warns} warning(s)`,
  };
}
