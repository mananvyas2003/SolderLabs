# SolderLab

Version, review, and release electronics designs — with evidence-linked review that understands the schematic.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo login:** `demo@solderlab.dev` / `demo`

### Happy path

1. Sign in → **solderlab** → **Blinky Board**
2. **Seed blinky fixtures** → Compare (**electrical** / schematic / PCB / BOM / SolderLab Review)
3. Design Review → merge (checks-gated; **connectivity-gate** vs parent)
4. Cut a **Release**
5. **Pinout** sync for `U1` → download `.h`

### CLI

```bash
npm run solderlab -- push --org solderlab --project blinky --file ./board.zip
```

Env: `SOLDERLAB_URL`, `SOLDERLAB_EMAIL`, `SOLDERLAB_PASSWORD`

## What’s in this repo

Collaboration surfaces for hardware teams (orgs, revisions, visual + electrical diff, reviews, checks, releases, library policy) plus:

- KiCad wire/pin connectivity resolve → DesignSnapshot
- NetDiff-style semantic electrical diff
- Pinout sync (foundation for Board Support Contract)

## KiCad corpus

Real open-source boards for parser/diff regression (not the blinky demo):

```bash
npm run corpus:fetch
```

Writes `fixtures/corpus/<id>/{older,newer}/` and `fixtures/corpus/manifest.json` (source URL, commit SHA, sheet/component counts, hierarchical flag, KiCad major guess). Failures are recorded in the manifest — nothing synthetic is substituted.

## Explicitly not mocked here

Enterprise SSO, fake DFM partner jobs, storage-prefix “data residency”, and public explore/star/fork were removed. Rebuild only when a real customer needs them.

## Rename note

Formerly developed under a working name that collided with an existing PCB AI company. Product name is **SolderLab**; AI assist is **SolderLab Review**.
