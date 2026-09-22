<!-- phase-id: 5.38 -->

# Phase 5.38 — Family A Downstream Fragmentation

## Status

- **Status:** in-progress (Stage 00 complete; production behavior unchanged)
- **Active stage:** P5.38-01 (shadow downstream grouping; not started/authorized)
- **Completed stages:** P5.38-00 ([`reports/P5.38-00-audit-baseline-gate-freeze.md`](reports/P5.38-00-audit-baseline-gate-freeze.md))
- **Base:** local `master` at `50b0a5a`, which contains the P5.37 closeout and default-on Family-B integration
- **Current branch:** `feat/p538-family-a-downstream`
- **Stop boundary:** P5.38-00 complete; await explicit continuation before P5.38-01

## Required Reading Order

1. Root `AGENTS.md`
2. [`docs/ai-handoff/README.md`](../ai-handoff/README.md) and [`HANDOFF.md`](../ai-handoff/HANDOFF.md)
3. [`00-START-HERE.md`](00-START-HERE.md)
4. [`CODEX-HANDOFF.md`](CODEX-HANDOFF.md)
5. [`work-instructions.md`](work-instructions.md)
6. [`execution-state.json`](execution-state.json)
7. [`contracts/01-scope-and-non-goals.md`](contracts/01-scope-and-non-goals.md) through [`contracts/07-default-and-rollback.md`](contracts/07-default-and-rollback.md)
8. Active stage file, then its report

## Stages

1. `P5.38-00` — audit / baseline / gate freeze
2. `P5.38-01` — shadow downstream grouping comparison
3. `P5.38-02` — promotion evaluation (`PROMOTION = PASS|FAIL`)
4. `P5.38-03` — production integration only after Promotion PASS
5. `P5.38-04` — hardening / acceptance
6. `P5.38-05` — closeout

## What this phase fixes

Only this confirmed family:

```text
source meter → downstream progression grouping / bar / block / text fragmentation
```

The intended fix is **not** to alter harmonic identity and **not** to rewrite source meter.

## Why a new abstraction may be required

The current pipeline appears to reuse source-meter bars for multiple responsibilities:

- source notation / meter truth;
- analyzer bookkeeping;
- progression text grouping;
- block grouping;
- placeholder / dash emission;
- UI-facing progression segmentation.

A 1/4 source therefore makes one quarter-note behave like a full downstream progression bar.

P5.38 should determine the smallest safe separation between:

```text
source bar coordinates
```

and

```text
analysis/presentation grouping coordinates
```

without lying about meter.

## Important non-goal

Do not re-open Family B.

`enableUnionChimeraPartition` should remain behaviorally unchanged and its regression tests must stay green.

## Strategy candidates to evaluate, not pre-decide

### G0 — Legacy

Use source bars everywhere.

### G1 — Separate presentation/harmonic grouping grid

Keep source meter intact, but derive downstream progression groups from an explicitly separate beat-based grouping abstraction.

### G2 — Timeline-driven grouping

Build blocks/text from already-resolved harmonic timeline regions rather than directly from source-bar count.

### G3 — Minimal hybrid

Keep source-bar truth for provenance/UI metadata while downstream progression formatting uses a separate grouping coordinate.

P5.38-00/01 must compare the actual repo seams and choose the smallest evidence-backed strategy.

Do not blindly choose fixed 4 beats for every meter.
