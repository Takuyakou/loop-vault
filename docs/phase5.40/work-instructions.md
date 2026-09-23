<!-- phase-id: 5.40 -->

# Phase 5.40 — Work Instructions

## Goal

P5.40-00, P5.40-01 and the separately authorized P5.40-02 are complete.
Stage02 evaluated the frozen bounded Shadow candidate-generation correction
without retuning. Shadow safety failed; stop before Stage03 and production.

## Scope

- Follow the pre-implementation [`P5.40-01 design lock`](P5.40-01-design-lock.md).
- Preserve the frozen Stage02 276-candidate baseline and score/tie-break.
- Add one bounded evidence-derived Shadow candidate-generation path and
  privacy-safe synthetic/generalization, anti-overfit, bound, determinism,
  and source-fidelity tests.
- Evaluate the frozen Stage01 Shadow path against synthetic, protected and
  private whole-file evidence; record only anonymous Stage02 aggregates under
  [`reports/`](reports/README.md).

## Non-goals

No score/weight/penalty/tie-break retune, Family B or smoothing change,
production integration, parser/schema/fileVersion change, migration, UI work,
Stage03 Promotion evaluation, merge, or push.

## Contracts

The source-fidelity, ground-truth, score-breakdown, anti-overfit, testing,
privacy, and stop contracts are in [`package/`](package/README.md). The
P5.39 final FAIL is immutable historical evidence.

## Stages

P5.40-00, P5.40-01 and P5.40-02 are closed. No stage is active. Stage03 and
Stage04 remain unauthorized proposals.

## Definition of Done

Stage02 requires an evaluation-only connection to the frozen Stage01 ranker,
synthetic/protected and private whole-file checks, deterministic bounded source-
immutable output, focused and full regression, validators, a privacy-safe
report, and a clean production diff. The Stage02 safety verdict may be FAIL;
completion does not imply Promotion authorization.

## Safety

The root `AGENTS.md` is canonical. Preserve private evidence in ignored-local
files only; never merge or push automatically.
