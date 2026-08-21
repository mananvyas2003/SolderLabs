# Vendor: Abheesht04/new_sch

Source: https://github.com/Abheesht04/new_sch (Deterministic Topology & Physics Solver).

Local overlays for SolderLab:
- `ac_physics.h` / `ac_physics.c` — AC stubs so the DC path builds
- Built via `packages/physics-engine/build.mjs` → `bin/solderlab-physics`
- JSON entrypoint: `packages/physics-engine/src/json_cli.c` (shell.c excluded)

Do not edit SQLite amalgamation or cJSON unless upstreaming.
