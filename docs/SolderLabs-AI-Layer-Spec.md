# SolderLabs — AI Layer Design Specification

**Version 1.0 · 17 August 2026**
Companion to the hardware product spec and agent prompt pack.

---

## 0. The design constraint everything follows from

### Why Cursor works, precisely

Cursor is not valuable because it has a chat panel. It is valuable because **the verifier is free and instant**. Accept a suggestion, the type checker runs in 200 ms, the test suite in 5 s, hot reload shows the result. The cost of a wrong suggestion is approximately zero. That economics lets a model be wrong 30% of the time and still be transformative.

### Why hardware inverts it

| | Software | Hardware |
|---|---|---|
| Verify a change | 200 ms – 5 s | 2–6 weeks (fab + assembly + bring-up) |
| Cost of a wrong suggestion | ~$0 | $5,000–50,000 and a slipped quarter |
| Undo | `git revert` | None |
| Iterations per day | hundreds | ~0.02 |

A chat assistant that emits plausible hardware advice into that environment is not a productivity tool. It is a liability generator, and the first time it costs someone a board spin, the product is dead in that account permanently.

### The consequence

**You cannot be Cursor for hardware until you have built the cheap, instant verifier. That verifier is the deterministic engine SolderLabs already has.**

The net graph, `diffSnapshots`, the six checks, `generateBSC`, `gateImpactClaims`, the `kicad-cli` netlist oracle — collectively, that is the compiler and the test suite. It is the reason SolderLabs can attempt this and a generic chatbot cannot.

**Therefore the core architectural rule:**

> No AI output reaches a user unless it has been executed against the deterministic engine and the engine's verdict is shown alongside it.

Not "here is some advice." Instead: *"here is the change, here is what my checks say happens if you make it, and here is the evidence."*

### What this implies about engine gaps

Every gap in the verifier is a place where AI output cannot be checked, and therefore must be withheld or heavily caveated.

| Gap | Blocks |
|---|---|
| MCU detection | Every firmware-facing AI feature |
| Pin extraction | BSC-grounded suggestions |
| GND resolution | Rail and decoupling analysis |
| Net mismatch budget | Any net-level claim |
| Citation gate | All of it |

**Fixing the verifier is AI work.** It is the highest-leverage AI work available, even though none of it involves a model.

---

## 1. Architecture: Propose → Verify → Explain

### 1.1 The loop

```
User intent
    │
    ▼
1. PLAN      Model calls tools to gather grounded facts. Never computes a value itself.
2. PROPOSE   Model emits a STRUCTURED CHANGE, not prose: { operations[], rationale, refs[] }
3. APPLY     Engine applies it to a SHADOW SNAPSHOT. Never touches the user's .kicad_sch.
4. VERIFY    Full deterministic suite on the shadow: diff, 6 checks, BSC delta, oracle
5. EXPLAIN   Show the change + the ENGINE's verdict. Model writes prose only about verified facts.
```

Steps 3 and 4 are the product. Steps 1, 2, and 5 are the model.

### 1.2 The shadow snapshot

The single most important new primitive. It is what makes suggestions executable.

A shadow is never promotable to a revision. Applying a change is always a human action in KiCad. SolderLabs has no write path to `.kicad_sch` and should not acquire one.

`derived` is produced by re-running the **real** connectivity resolver on the mutated design, never by patching the snapshot in place. If the resolver cannot re-resolve, status is `unverifiable` and the suggestion is withheld.

`coverage` is computed, not asserted. A proposal touching nets inside the mismatch budget has reduced coverage and must say so.

### 1.3 Tool layer

Wrap existing exports. Add zero new logic in the tool layer itself.

| Tool | Backed by |
|---|---|
| `get_net(name)` | net graph |
| `get_component(refdes)` | snapshot |
| `trace_from(refdes, pin, hops)` | net graph |
| `get_power_tree()` | `classifyNet` + rails |
| `get_decoupling(refdes)` | net graph |
| `diff_revisions(a, b)` | `diffSnapshots` |
| `run_checks(revisionId)` | existing checks |
| `get_bsc(revisionId)` | `generateBSC` |
| `get_bom_drift()` | BOM + parts data |
| `get_part_supply(mpn)` | parts provider |
| `search_datasheet(mpn, query)` | vector store |
| **`simulate_change(ops[])`** | **shadow snapshot** |

`simulate_change` is the tool that makes this AI-native rather than AI-decorated. Every proposal must call it before surfacing.

### 1.4 Three-class output rendering

| Class | Origin | Can gate a merge? |
|---|---|---|
| **Verified** | Engine output, verbatim | Yes — but only the engine's own checks |
| **Proposed** | Model, passed `simulate_change` | Never |
| **Advisory** | Model, no deterministic oracle exists | Never |

**A model-generated sentence must never be able to change `electricalGate`, a check status, or merge eligibility.**

---

## 2. Citation gate (AI-1)

1. **Structured output only.** Force `{ finding, refs[], severity, type }`. Never accept a bare string.
2. **Content check.** Reject claims containing imperative or meta-instruction language. Reject any claim whose `finding` text does not mention at least one of its own `refs`.
3. **Sanitize on ingest.** Strip control-ish tokens from refdes and net names before they enter a prompt. Fence all board data in delimited blocks.
4. **Claim-type whitelist.** Unknown types are dropped, not rendered.

---

## 3. Feature roadmap, ordered by verifiability

**Tier A** — Fully verifiable today: firmware patch generation, bring-up scripts, review synthesis, ECO/changelog, commit notes.

**Tier B** — Needs engine work: part substitution, decoupling audit, test-point coverage, net naming, datasheet pin functions.

**Tier C** — No deterministic oracle. Advisory only, permanently, in a separate surface labelled "not verified by SolderLabs."

---

## 4. Model routing

Route by job, not vendor. Structured outputs and tool use cannot be combined in one Groq call — tools first, then a schema-constrained call.

Offer a self-hosted path for classification and RAG (defense / medical / aerospace).

---

## 5. Build sequence

| Phase | Work | Gate to proceed |
|---|---|---|
| **AI-0** | Verifier: MCU on every compute demo (analog/hub stay empty); pin extraction; GND both directions; worst pinset budget < 300 | The engine can check what the AI will claim |
| **AI-1** | Harden `gateImpactClaims`. Unify env keys. `llm` provenance. Provider seam. | Injection citing a real refdes lands in `dropped[]` |
| **AI-2** | Tool layer + board card + `simulate_change` / shadow snapshot | A proposal can be executed and refuted |
| **AI-3** | Tier A1 firmware patch generation | Compile + BSC + tests attached to a real PR |
| **AI-4** | Tier A2–A5 | All grounded, all cheap |
| **AI-5** | Tier B, in order B1 → B5 | Each requires its own engine capability first |
| **AI-6** | Tier C in a separate advisory surface | Only after A and B are trusted |

**AI-0 is not optional and it is not a detour.**

---

## 6. Acceptance criteria

1. Adversarial injection citing a real refdes lands in `dropped[]`, not `grounded[]`.
2. No model output can alter `electricalGate`, a check status, or merge eligibility. Prove it with a test that attempts it.
3. Every AI proposal in the UI displays an engine verdict and a coverage percentage.
4. A proposal the engine refutes is shown as refuted, with the engine's reason.
5. `llm.attempted` / `llm.succeeded` / `llm.error` present in every response.
6. Provider outage degrades to deterministic-only output with a visible indicator.
7. Firmware patch generation: ≥80% of generated patches compile on first attempt across a 20-case corpus.
8. Zero fabricated confidence values.

---

## 7. Positioning

> **The only AI that can prove its suggestions.**

The hardware engineer's objection to AI is not "it isn't smart enough." It is "I can't tell when it's wrong, and being wrong costs me six weeks." Whoever solves *that* wins this category, and it is solved with a verifier, not a bigger model.

---

## Appendix — Anti-patterns

- Do not build a chat panel first.
- Do not let AI write to `.kicad_sch`.
- Do not use AI to explain the diff.
- Do not ship a confidence number you did not compute.
- Do not accept an acceptance test you have not seen fail.
