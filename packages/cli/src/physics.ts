import fs from "node:fs";
import path from "node:path";
import { arg, flag } from "./args";
import {
  classifyPhysicsResponse,
  findPartCandidates,
  physicsBinaryAvailable,
  renderPhysicsFindings,
  solveDc,
  synthesizeTopology,
  type PhysicsRequest,
  type PhysicsStamp,
} from "@solderlab/physics";

export async function cmdPhysics(argv: string[], cwd: string): Promise<number> {
  const sub = argv[0];
  if (!physicsBinaryAvailable()) {
    console.error(
      "solderlab-physics binary missing. Build with:\n  npm run build -w @solderlab/physics-engine",
    );
    return 1;
  }

  if (sub === "solve-dc") {
    const jsonPath = arg(argv, "json");
    if (!jsonPath) {
      console.error(
        "Usage: solderlab physics solve-dc --json <file>\n" +
          'File: { "nodes": 2, "stamps": [...], "probes": [...] }',
      );
      return 1;
    }
    const abs = path.resolve(cwd, jsonPath);
    const raw = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
    const body = JSON.parse(raw) as {
      nodes?: number;
      stamps?: PhysicsStamp[];
      probes?: { name: string; node: number; expected?: number }[];
    };
    const res = solveDc({
      nodes: body.nodes ?? 0,
      stamps: body.stamps ?? [],
      probes: body.probes,
    });
    const classified = classifyPhysicsResponse(res, "solve_dc");
    console.log(
      JSON.stringify(
        { ...res, findingsText: renderPhysicsFindings(res), classified },
        null,
        2,
      ),
    );
    return res.status === "unverifiable" && !res.ok ? 1 : 0;
  }

  if (sub === "synthesize") {
    const topology = arg(argv, "topology");
    const vin = Number(arg(argv, "vin"));
    const vout = Number(arg(argv, "vout"));
    const ioutRaw = arg(argv, "iout");
    if (!topology || !Number.isFinite(vin) || !Number.isFinite(vout)) {
      console.error(
        "Usage: solderlab physics synthesize --topology resistor_divider --vin 12 --vout 3.3 [--iout 0.5]",
      );
      return 1;
    }
    const res = synthesizeTopology({
      topology,
      vin,
      vout,
      iout: ioutRaw !== undefined ? Number(ioutRaw) : undefined,
    });
    const classified = classifyPhysicsResponse(res, "synthesize");
    console.log(
      JSON.stringify(
        {
          ...res,
          findingsText: renderPhysicsFindings(res),
          classified,
          note: "Bindings are Proposed — apply in KiCad; SolderLab does not write .kicad_sch",
        },
        null,
        2,
      ),
    );
    return res.ok ? 0 : 1;
  }

  if (sub === "candidates") {
    const type = arg(argv, "type") ?? "resistor";
    const value = Number(arg(argv, "value"));
    const pkg = arg(argv, "package") ?? "0603";
    if (!Number.isFinite(value)) {
      console.error(
        "Usage: solderlab physics candidates --type resistor --value 10000 [--package 0603]",
      );
      return 1;
    }
    const res = findPartCandidates({ type, value, package: pkg });
    console.log(JSON.stringify(res, null, 2));
    return res.ok ? 0 : 1;
  }

  if (sub === "ping" || flag(argv, "ping")) {
    const { invokePhysics } = await import("@solderlab/physics");
    console.log(JSON.stringify(invokePhysics({ op: "ping" } as PhysicsRequest), null, 2));
    return 0;
  }

  console.error(`Usage:
  solderlab physics solve-dc --json <file>
  solderlab physics synthesize --topology resistor_divider --vin 12 --vout 3.3
  solderlab physics candidates --type resistor --value 10000
  solderlab physics ping`);
  return 1;
}
