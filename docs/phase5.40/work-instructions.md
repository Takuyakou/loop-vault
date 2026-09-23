<!-- phase-id: 5.40 -->

# Phase 5.40 — Work Instructions

## Goal

P5.40-00 and the separately authorized P5.40-01 are complete. Stage01
implemented one bounded Shadow-only candidate-generation correction for the
diagnosed general mechanism. Stop here; no Stage02 evaluation or Promotion.

## Scope

- Follow the pre-implementation [`P5.40-01 design lock`](P5.40-01-design-lock.md).
- Preserve the frozen Stage02 276-candidate baseline and score/tie-break.
- Add one bounded evidence-derived Shadow candidate-generation path and
  privacy-safe synthetic/generalization, anti-overfit, bound, determinism,
  and source-fidelity tests.
- Write an anonymous Stage01 report under [`reports/`](reports/README.md).

## Non-goals

No score/weight/penalty/tie-break retune, Family B or smoothing change,
production integration, parser/schema/fileVersion change, migration, UI work,
Stage02 execution, merge, or push.

## Contracts

The source-fidelity, ground-truth, score-breakdown, anti-overfit, testing,
privacy, and stop contracts are in [`package/`](package/README.md). The
P5.39 final FAIL is immutable historical evidence.

## Stages

P5.40-00 and P5.40-01 are closed. No stage is active. P5.40-02 through 04
remain unauthorized proposals.

## Definition of Done

Stage01 requires the frozen design rule, bounded reachability across all
roots, negative/protected controls, deterministic and source-immutable output,
frozen Stage02 parity, focused tests and validators, a privacy-safe report, and
a clean production diff. A generated correct candidate does not prove that it
ranks first or that Promotion is safe.

## Safety

The root `AGENTS.md` is canonical. Preserve private evidence in ignored-local
files only; never merge or push automatically.
