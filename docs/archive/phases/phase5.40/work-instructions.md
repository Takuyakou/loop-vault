<!-- phase-id: 5.40 -->

# Phase 5.40 — Work Instructions

## Goal

P5.40 is CLOSED. P5.40-00 through the separately authorized P5.40-02c are
complete. Stage02c was a final safe-activation Shadow gate and ended
`SHADOW SAFETY = FAIL`.
The new anonymous region's source-first human classification was frozen
before candidate-origin unsealing; the private whole-file evaluation remains
Git ignored. Stop before Stage03 and production.

## Scope

- Preserve the pre-implementation [`P5.40-01 design lock`](P5.40-01-design-lock.md)
  [`P5.40-02b design lock`](P5.40-02b-design-lock.md) and
  [`P5.40-02c design lock`](P5.40-02c-design-lock.md) as historical evidence.
- Preserve all frozen stage results and anonymous reports under
  [`reports/`](reports/README.md). No further correction is authorized in
  P5.40-02c after its one-time private safety FAIL.

## Non-goals

No further retune, Family B or smoothing change, production integration,
parser/schema/fileVersion change, migration, UI work, Stage03 Promotion
evaluation, merge, or push.

## Contracts

The source-fidelity, ground-truth, score-breakdown, anti-overfit, testing,
privacy, and stop contracts are in [`package/`](package/README.md). The
P5.39 final FAIL is immutable historical evidence.

## Stages

P5.40-00, P5.40-01, P5.40-02, P5.40-02a, P5.40-02b and P5.40-02c are closed.
No stage is active; P5.40 is closed. Stage03 and Stage04 were not started.
The final decision and old-Core freeze/Core v2 handoff are in
[`P5.40-closeout.md`](reports/P5.40-closeout.md).

## Definition of Done

Stage02c's final FAIL is recorded with the one-time private safety aggregate,
deterministic bounded source-immutable evaluation, relevant and full regression,
validators, privacy-safe report and clean production diff. A safety FAIL does
not authorize Stage03 or a second correction round.

## Safety

The root `AGENTS.md` is canonical. Preserve private evidence in ignored-local
files only; never merge or push automatically.
