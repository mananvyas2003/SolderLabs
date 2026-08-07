# Real open-source KiCad corpus

Populated by `npm run corpus:fetch` (see `scripts/fetch-corpus.mjs`).

- `manifest.json` — source URLs, commit SHAs, sheet/component metrics, failures
- `<project-id>/<older|newer>/` — checked-out schematic trees (gitignored if large)

Do **not** put synthetic blinky boards here. Blinky remains under `fixtures/kicad/blinky/` for local demo UX only.
