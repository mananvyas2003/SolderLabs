# Firmware consumer example

Small C project that consumes a corpus Board Support Contract (Glasgow).

## Pull board headers

From the monorepo root:

```bash
npm run solderlab -- bsc pull \
  --board glasgow \
  --rev newer \
  --out examples/firmware-consumer/include \
  --format c \
  --cwd examples/firmware-consumer
```

This writes `include/board.h`, `.bsc-lock.json`, and `.bsc/locked.bsc.json`.

## Check for breaking upstream changes

```bash
node packages/cli/bin/solderlab.mjs bsc check \
  --scan src \
  --cwd examples/firmware-consumer
```

With `--scan`, breaking pin/I2C/rail changes print `file:line` call sites
(e.g. `src/main.c:16  SOLDERLAB_PIN_SDA  …`).

## CI

Repo workflow: `.github/workflows/firmware-consumer-bsc.yml`  
Composite action: `.github/actions/bsc-check`
