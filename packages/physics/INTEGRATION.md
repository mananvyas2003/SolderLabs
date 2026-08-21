# Physics engine integration (new_sch)

Deterministic **topology + MNA DC** verifier vendored from
[Abheesht04/new_sch](https://github.com/Abheesht04/new_sch).

SolderLab does **not** write `.kicad_sch` / `.kicad_pcb`. Synthesis bindings are
always **Proposed** until a human applies them in KiCad.

## Packages

| Package | Role |
|---|---|
| `@solderlab/physics-engine` | C sources + `solderlab-physics` JSON CLI |
| `@solderlab/physics` | TypeScript spawn wrapper + classification |

## Build

```bash
npm run physics:build
# or
npm run build -w @solderlab/physics-engine
```

Requires **gcc** (MinGW on Windows) or **cmake**. Output:

`packages/physics-engine/bin/solderlab-physics[.exe]`

Override path: `SOLDERLAB_PHYSICS_BIN=/path/to/solderlab-physics`

## JSON contract

Stdin JSON → stdout JSON. Always:

```json
{
  "ok": true,
  "status": "verified" | "refuted" | "unverifiable",
  "engineResults": {},
  "findings": [{ "type": "...", "severity": "...", "textTemplateFields": {}, "citations": [] }],
  "errors": []
}
```

### Ops

- `ping`
- `solve_dc` — `{ nodes, stamps[{kind,a,b,value}], probes? }`
- `synthesize` — `{ topology, vin, vout, iout? }`
- `find_candidates` — `{ type, value, package?, tolerance?, minV?, minI?, minP?, limit? }`
- `import_jlcpcb` — `{ csvPath, dbPath? }` (dev/admin)

Stamp kinds: `R`/`V`/`I`/`C`/`L` (aliases `resistor`, `voltage`, …). Node `0` = ground.

## CLI

```bash
solderlab physics ping
solderlab physics solve-dc --json ./divider.json
solderlab physics synthesize --topology resistor_divider --vin 12 --vout 3.3
solderlab physics candidates --type resistor --value 10000
```

## Verified vs Proposed

| Result | Class | Can gate merge? |
|---|---|---|
| `solve_dc` success | **verified** (engine voltages) | Yes for that check surface |
| `solve_dc` singular / floating | **refuted** | No |
| `synthesize` bindings | **proposed** always | Never |
| Binary missing | **unverifiable** | No |

Grounded claim text is **engine-templated** (`voltage_result`, `design_equation`, …). Model prose cannot become verified findings.

## LLM tools

Wrap `@solderlab/physics` only:

- `solve_dc_circuit`
- `synthesize_topology_block`
- `find_jlcpcb_candidates`

Extra args (`mpn`, `class`, `verified`, …) are ignored.

## AC / SPICE

`ac_physics.c` is a **stub** so DC builds. Frequency sweeps are unsupported in v1.
