<!-- phase-id: 5.38 -->

# Phase 5.38 — Family A Downstream Fragmentation

## Status

- **Status:** completed — `PASS — FAMILY A PRESENTATION FRAGMENTATION FIX
  INTEGRATED, HARDENED, AND ENABLED BY DEFAULT`
- **Active stage:** none; P5.38 is closed
- **Completed stages:** P5.38-00 ([`reports/P5.38-00-audit-baseline-gate-freeze.md`](reports/P5.38-00-audit-baseline-gate-freeze.md)), P5.38-01 ([`reports/P5.38-01-presentation-grouping-shadow.md`](reports/P5.38-01-presentation-grouping-shadow.md)), P5.38-02 ([`reports/P5.38-02-promotion-evaluation.md`](reports/P5.38-02-promotion-evaluation.md)), P5.38-03 ([`reports/P5.38-03-production-integration.md`](reports/P5.38-03-production-integration.md)), P5.38-04 ([`reports/P5.38-04-hardening-acceptance.md`](reports/P5.38-04-hardening-acceptance.md)), P5.38-05 ([`reports/P5.38-05-closeout.md`](reports/P5.38-05-closeout.md))
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
- **Shadow v2 Promotion Evaluation:** `PROMOTION = PASS` for the exact frozen
  v2 policy. See
  [`reports/P5.38-02b-v2-promotion-evaluation.md`](reports/P5.38-02b-v2-promotion-evaluation.md).
  The historical v1 `PROMOTION = FAIL` remains recorded separately.
- **P5.38-03 result:** the exact promoted v2 implementation is shared by
  research and production, attached only after the resolved `fullTimeline`,
  and guarded by `enablePresentationGrouping`. Omitted/false is exact legacy;
  Stage03 default remains OFF. Production ON reproduces the privacy-safe
  65 -> 25 presentation-group, 40 -> 0 dash, and 10 -> 8 block aggregate while
  source truth and harmonic identity remain unchanged.
- **P5.38-04 result:** `DEFAULT-ON = APPROVED`. The promoted v2 projection is
  consumed by Capture formatted presentation, card summaries, and card block
  topology while all edit/save/playback operations retain source candidates.
  Private aggregate reproduces 65/40/10 -> 25/0/8 with source truth unchanged;
  explicit false remains exact legacy rollback.
- **P5.38-05 result:** Family A presentation fragmentation is closed. Omitted
  `enablePresentationGrouping` and explicit `true` use the promoted
  `p538-presentation-grouping-shadow-v2`; explicit `false` remains exact legacy.
  Presentation grouping is runtime-only and does not rewrite source meter,
  timeline coordinates, persistence, or export. Family B remains protected and
  Family C remains a separate open issue.
- **Stop boundary:** P5.38 is closed. Do not start Family C, another phase,
  merge, or push automatically.

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
