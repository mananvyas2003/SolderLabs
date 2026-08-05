# Flux — GitHub for Hardware

Version, review, and release electronics designs together — with AI that understands what actually changed on the board.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo login:** `demo@flux.dev` / `demo`

### Happy path

1. Sign in → **flux-labs** → **Blinky Board**
2. **Seed blinky fixtures** → Compare (**electrical** / schematic / PCB / BOM / Copilot)
3. Design Review → merge (checks-gated; **connectivity-gate** vs parent)
4. Cut a **Release** → submit **DFM**
5. **Pinout** sync for `U1` → download `.h` (pins from connectivity resolve)
6. Org **Enterprise** → enable SSO + set data residency
7. Project **Settings** → visibility `public` → **/explore** to star/fork

### Phase 4 enterprise

| Feature | Where |
|---|---|
| SSO / SAML (demo ACS) | `/sso` + Org → Enterprise |
| Data residency | Org → Enterprise (`regions/<id>/…` storage) |
| DFM partners | Project → DFM |
| Firmware pinout sync | Project → Pinout |
| Public community | `/explore` + project visibility |

SSO demo: enable SSO on org, then open `/sso` with assertion `flux-demo-assertion` (built into the page).

### CLI

```bash
npm run flux -- push --org flux-labs --project blinky --file ./board.zip
```

## Implemented (Phase 0–4)

Phase 0–3 collaboration platform **plus** Phase 4: SSO/SAML settings + demo ACS, DFM partner jobs, firmware pinout sync/export, data residency regions, public explore/star/fork.

**Electrical core (NetDiff / parser_new inspired):** KiCad wire+pin connectivity resolve → DesignSnapshot pins/nets; NetDiff-style semantic diff (rename / merge / split / pin moves); Compare → **electrical** tab; Copilot `/nets`; `connectivity-gate` check vs parent (critical shorts hard-block merge when green checks required).

Real cloud IdP signature validation, live fab APIs, and multi-region cloud storage remain production integrations on top of these surfaces.
