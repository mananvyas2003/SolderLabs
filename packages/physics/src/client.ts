import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PhysicsProbe,
  PhysicsRequest,
  PhysicsResponse,
  PhysicsStamp,
} from "./types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export function resolvePhysicsBinary(): string | null {
  if (process.env.SOLDERLAB_PHYSICS_BIN) {
    const p = process.env.SOLDERLAB_PHYSICS_BIN;
    return fs.existsSync(p) ? p : null;
  }
  const engineRoot = path.resolve(here, "../../physics-engine");
  const candidates = [
    path.join(engineRoot, "bin", "solderlab-physics.exe"),
    path.join(engineRoot, "bin", "solderlab-physics"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function physicsBinaryAvailable(): boolean {
  return resolvePhysicsBinary() != null;
}

function asResponse(raw: unknown): PhysicsResponse {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      status: "unverifiable",
      engineResults: {},
      findings: [],
      errors: ["invalid engine response"],
    };
  }
  const o = raw as Record<string, unknown>;
  const status =
    o.status === "verified" ||
    o.status === "refuted" ||
    o.status === "unverifiable"
      ? o.status
      : "unverifiable";
  return {
    ok: Boolean(o.ok),
    status,
    engineResults:
      o.engineResults && typeof o.engineResults === "object"
        ? (o.engineResults as Record<string, unknown>)
        : {},
    findings: Array.isArray(o.findings)
      ? (o.findings as PhysicsResponse["findings"])
      : [],
    errors: Array.isArray(o.errors)
      ? o.errors.filter((e): e is string => typeof e === "string")
      : [],
  };
}

/** Invoke solderlab-physics --json. Never invents results when binary missing. */
export function invokePhysics(request: PhysicsRequest): PhysicsResponse {
  const bin = resolvePhysicsBinary();
  if (!bin) {
    return {
      ok: false,
      status: "unverifiable",
      engineResults: {},
      findings: [],
      errors: [
        "solderlab-physics binary not found — run: npm run build -w @solderlab/physics-engine",
      ],
    };
  }
  const input = JSON.stringify(request);
  const r = spawnSync(bin, ["--json"], {
    input,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  if (r.error) {
    return {
      ok: false,
      status: "unverifiable",
      engineResults: {},
      findings: [],
      errors: [`spawn failed: ${r.error.message}`],
    };
  }
  const stdout = (r.stdout ?? "").trim();
  if (!stdout) {
    return {
      ok: false,
      status: "unverifiable",
      engineResults: {},
      findings: [],
      errors: [
        `empty stdout (exit ${r.status ?? "?"}): ${(r.stderr ?? "").slice(0, 400)}`,
      ],
    };
  }
  let parsed: unknown;
  try {
    const line = stdout.split(/\r?\n/).filter(Boolean).pop()!;
    parsed = JSON.parse(line);
  } catch (e) {
    return {
      ok: false,
      status: "unverifiable",
      engineResults: {},
      findings: [],
      errors: [`JSON parse failed: ${String(e)}`],
    };
  }
  return asResponse(parsed);
}

export function solveDc(args: {
  nodes: number;
  stamps: PhysicsStamp[];
  probes?: PhysicsProbe[];
}): PhysicsResponse {
  return invokePhysics({
    op: "solve_dc",
    nodes: args.nodes,
    stamps: args.stamps,
    probes: args.probes,
  });
}

export function synthesizeTopology(args: {
  topology: string;
  vin: number;
  vout: number;
  iout?: number;
  package?: string;
  tolerance?: string;
}): PhysicsResponse {
  return invokePhysics({ op: "synthesize", ...args });
}

export function findPartCandidates(args: {
  type: string;
  value: number;
  package?: string;
  tolerance?: string;
  minV?: number;
  minI?: number;
  minP?: number;
  limit?: number;
}): PhysicsResponse {
  return invokePhysics({ op: "find_candidates", ...args });
}

export function importJlcpcbCsv(args: {
  csvPath: string;
  dbPath?: string;
}): PhysicsResponse {
  return invokePhysics({ op: "import_jlcpcb", ...args });
}
