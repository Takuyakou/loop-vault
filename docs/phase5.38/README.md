<!-- phase-id: 5.38 -->

# Phase 5.38 — Family A Downstream Fragmentation

## Status

- **Status:** blocked after Shadow v2 research addendum — v2 is
  `READY FOR PROMOTION`; production behavior unchanged
- **Active stage:** none; a new Promotion Evaluation requires explicit review
- **Completed stages:** P5.38-00 ([`reports/P5.38-00-audit-baseline-gate-freeze.md`](reports/P5.38-00-audit-baseline-gate-freeze.md)), P5.38-01 ([`reports/P5.38-01-presentation-grouping-shadow.md`](reports/P5.38-01-presentation-grouping-shadow.md)), P5.38-02 ([`reports/P5.38-02-promotion-evaluation.md`](reports/P5.38-02-promotion-evaluation.md))
- **Base:** local `master` at `50b0a5a`, which contains the P5.37 closeout and default-on Family-B integration
- **Current branch:** `feat/p538-family-a-downstream`
- **P5.38-01 result:** runtime-only source/presentation separation, meter parity,
  source round-trip, and synthetic improvement are proven. Frozen shadow v1
  fails closed on LF-MIDI-001 and therefore misses Gate A (65/40 remain 65/40).
  No post-private retuning was performed.
- **P5.38-02 decision:** `PROMOTION = FAIL`. Architecture evidence remains
  useful, but frozen v1 cannot enter production because hard Gate A failed.
- **Shadow v2 addendum:** synthetic-only policy freeze `871da02` passes all
  hard negatives and private Gate A (65/40 -> 25/0). See
  [`reports/P5.38-shadow-v2-redesign-addendum.md`](reports/P5.38-shadow-v2-redesign-addendum.md).
  This does not overwrite the v1 `PROMOTION = FAIL` decision.
- **Stop boundary:** await explicit human direction for a new Promotion
  Evaluation; do not start P5.38-03 automatically

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
