<!-- phase-id: 5.40 -->

# Phase 5.40 — Work Instructions

## Goal

P5.40-00, P5.40-01, P5.40-02 and the separately authorized P5.40-02a are
complete. Stage02a isolated the Shadow safety failures without retuning.
The new anonymous region remains unclassified; stop before Stage03 and
production.

## Scope

- Follow the pre-implementation [`P5.40-01 design lock`](P5.40-01-design-lock.md).
- Preserve the frozen Stage02 276-candidate baseline and score/tie-break.
- Add one bounded evidence-derived Shadow candidate-generation path and
  privacy-safe synthetic/generalization, anti-overfit, bound, determinism,
  and source-fidelity tests.
- Evaluate the frozen Stage01 Shadow path against synthetic, protected and
  private whole-file evidence; record only anonymous Stage02 aggregates under
  [`reports/`](reports/README.md).
- Compare frozen and opt-in ranking through Family B and smoothing, keep
  numerical diagnosis ignored-local, and prepare source-only blind review for
  the newly changed region without guessing its correctness.

## Non-goals

No score/weight/penalty/tie-break retune, Family B or smoothing change,
production integration, parser/schema/fileVersion change, migration, UI work,
Stage03 Promotion evaluation, merge, or push.

## Contracts

The source-fidelity, ground-truth, score-breakdown, anti-overfit, testing,
privacy, and stop contracts are in [`package/`](package/README.md). The
P5.39 final FAIL is immutable historical evidence.

## Stages

P5.40-00, P5.40-01, P5.40-02 and P5.40-02a are closed. No stage is active.
Stage03 and Stage04 remain unauthorized proposals.

## Definition of Done

Stage02a requires a frozen-input local diagnosis, first-divergence and
interaction matrix, source-only blind packet for the new region, deterministic
bounded source-immutable evaluation, focused and full regression, validators,
a privacy-safe report, and a clean production diff. A sufficient diagnosis
does not resolve the new region's ground truth or authorize a correction.

## Safety

The root `AGENTS.md` is canonical. Preserve private evidence in ignored-local
files only; never merge or push automatically.
