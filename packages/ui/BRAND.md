# SolderLab brand kit — “Instrument Lab”

Calm engineering product UI. Closer to a metrology bench than a marketing site.

## Principles

1. **Flat identity** — No gradients as brand. Accent appears in the wordmark mark, links, focus rings, and primary actions only.
2. **Density over decoration** — Hairline borders, white panels on cool paper, sparse type.
3. **One accent** — Teal oxide. Never purple SaaS gradients or glow.

## Wordmark

- Name: **SolderLab** (mixed case, not `SOLDERLAB`)
- Mark: 8×8px square in accent teal, 2px radius, left of the name
- Type: IBM Plex Sans Semibold, ~13–15px, ink color
- Component: `apps/web/src/components/brand-mark.tsx`

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--surface-0` | `#f6f8fa` | Page canvas |
| `--surface-1` | `#ffffff` | Panels, header |
| `--surface-2` | `#eef1f4` | Hover / inset |
| `--text` | `#1f2328` | Body |
| `--text-muted` | `#636c76` | Secondary |
| `--border` | `#d0d7de` | Rules |
| `--accent` | `#0f766e` | Brand / primary CTA |
| `--accent-hover` | `#0d9488` | Primary hover |
| `--accent-fg` | `#ffffff` | On primary |
| `--danger` | `#cf222e` | Errors |
| `--success` | `#1a7f37` | Pass |
| `--warn` | `#9a6700` | Warnings |

Diff tokens (`--diff-add`, `--diff-del`, `--diff-chg`) stay muted for schematic review.

Source of truth: `packages/ui/src/tokens.css`

## Type

- **UI:** IBM Plex Sans (400 / 500 / 600)
- **Code / paths / IDs:** IBM Plex Mono (400 / 500)

## Shape & chrome

- Radius: `6px` (controls), `4px` (badges)
- Shadow: single 1px lift only (`--shadow-sm`) — no stacked glow
- Header: sticky white bar, 1px bottom border
- Lists: bordered white panel, row hover → `--surface-2`

## Do / don’t

| Do | Don’t |
| --- | --- |
| Solid teal primary with white label | Dark text on copper / teal |
| Quiet grid as product demo texture | Full-page radial gradients |
| Monospace for refs, hashes, paths | All-caps tracked brand labels |
| One job per section | Stat strips / pill clouds in heroes |
