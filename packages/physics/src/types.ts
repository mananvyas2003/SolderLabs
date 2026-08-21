/**
 * JSON IPC contract for solderlab-physics (new_sch backend).
 * Status is engine-owned. Synthesis bindings are always Proposed in TS.
 */

export type PhysicsEngineStatus =
  | "verified"
  | "refuted"
  | "unverifiable";

export type PhysicsClaimType =
  | "voltage_result"
  | "power_dissipation"
  | "design_equation"
  | "part_rating_risk";

export type PhysicsStampKind =
  | "R"
  | "resistor"
  | "V"
  | "voltage"
  | "I"
  | "current"
  | "C"
  | "capacitor"
  | "L"
  | "inductor";

export interface PhysicsStamp {
  kind: PhysicsStampKind;
  /** Node A (0 = ground). */
  a: number;
  /** Node B (0 = ground). */
  b: number;
  value: number;
}

export interface PhysicsProbe {
  name: string;
  node: number;
  expected?: number;
}

export type PhysicsTopology =
  | "resistor_divider"
  | "rc_filter"
  | "lc_filter"
  | "pi_filter"
  | "buck_converter";

export type PhysicsPartType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "transistor";

export interface PhysicsCitation {
  kind: string;
  ref: string;
}

export interface PhysicsFinding {
  type: PhysicsClaimType | string;
  severity: string;
  textTemplateFields: Record<string, string | number | boolean>;
  citations: PhysicsCitation[];
}

export interface PhysicsResponse {
  ok: boolean;
  status: PhysicsEngineStatus;
  engineResults: Record<string, unknown>;
  findings: PhysicsFinding[];
  errors: string[];
}

export type PhysicsRequest =
  | { op: "ping" }
  | {
      op: "solve_dc";
      nodes: number;
      stamps: PhysicsStamp[];
      probes?: PhysicsProbe[];
    }
  | {
      op: "synthesize";
      topology: PhysicsTopology | string;
      vin: number;
      vout: number;
      iout?: number;
      package?: string;
      tolerance?: string;
    }
  | {
      op: "find_candidates";
      type: PhysicsPartType | string;
      value: number;
      package?: string;
      tolerance?: string;
      minV?: number;
      minI?: number;
      minP?: number;
      limit?: number;
    }
  | {
      op: "import_jlcpcb";
      csvPath: string;
      dbPath?: string;
    };

export interface BoundPart {
  role: string;
  bound: boolean;
  mpn: string;
  value: number;
  package: string;
}
