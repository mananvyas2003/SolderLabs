import type { PcbSnapshot } from "@flux/design-core";
import { nanoid } from "nanoid";

export type DfmFinding = {
  id: string;
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
};

/** Local heuristics simulating a DFM partner response */
export function runLocalDfm(
  partnerKey: string,
  pcb: PcbSnapshot | null,
  bomCount: number,
): { status: "passed" | "failed"; findings: DfmFinding[]; summary: string } {
  const findings: DfmFinding[] = [];

  if (!pcb) {
    findings.push({
      id: nanoid(8),
      severity: "error",
      code: "NO_PCB",
      message: "No PCB snapshot available for DFM",
    });
  } else {
    if ((pcb.meta.widthMm ?? 0) > 100 || (pcb.meta.heightMm ?? 0) > 100) {
      findings.push({
        id: nanoid(8),
        severity: "warn",
        code: "PANEL_SIZE",
        message: `Board ${pcb.meta.widthMm?.toFixed(1)}×${pcb.meta.heightMm?.toFixed(1)} mm may need panelization for ${partnerKey}`,
      });
    }
    const thin = pcb.tracks.filter((t) => t.width < 0.15);
    if (thin.length) {
      findings.push({
        id: nanoid(8),
        severity: "error",
        code: "MIN_TRACE",
        message: `${thin.length} track segment(s) below 0.15 mm min width`,
      });
    }
    if (pcb.footprints.length === 0) {
      findings.push({
        id: nanoid(8),
        severity: "error",
        code: "NO_FOOTPRINTS",
        message: "PCB has no footprints",
      });
    }
    if (partnerKey === "eurocircuits") {
      findings.push({
        id: nanoid(8),
        severity: "info",
        code: "RESIDENCY",
        message: "Job routed to EU DFM profile (Eurocircuits)",
      });
    }
  }

  if (bomCount === 0) {
    findings.push({
      id: nanoid(8),
      severity: "warn",
      code: "EMPTY_BOM",
      message: "BOM is empty — assembly quotes may fail",
    });
  }

  const errors = findings.filter((f) => f.severity === "error");
  const status = errors.length ? "failed" : "passed";
  return {
    status,
    findings,
    summary: errors.length
      ? `${errors.length} DFM error(s) from ${partnerKey}`
      : `DFM passed via ${partnerKey} (${findings.length} note(s))`,
  };
}
