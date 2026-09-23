<!-- phase-id: 5.40 -->

# Phase 5.40 — Local Harmonic Identity / Partition Ranking Correction

## Status

- **Status:** Stage01 authorized, Shadow-only candidate-generation correction
- **Active stage:** P5.40-01
- **Completed stages:** P5.40-00
- **Base:** P5.39 failed-promotion Closeout at `77e0458a6893057b7ca6da125ad7875fd01e4605`
- **Current branch:** `feat/p540-local-harmonic-identity-ranking`
- **Stop boundary:** stop after focused Stage01 Shadow validation; do not begin Stage02 or modify production

## Required Reading Order

1. Root `AGENTS.md` and [`docs/ai-handoff/HANDOFF.md`](../ai-handoff/HANDOFF.md)
2. [`P5.39-closeout.md`](../phase5.39/P5.39-closeout.md) and [`P5.39-03d`](../phase5.39/P5.39-03d-final-promotion-reevaluation.md)
3. [`package/CODEX-START-HERE.md`](package/CODEX-START-HERE.md) and [`package/README.md`](package/README.md)
4. [`package/00-phase-contract.md`](package/00-phase-contract.md) through [`package/09-stop-boundaries.md`](package/09-stop-boundaries.md)
5. [`package/P5.40-00-audit-ground-truth-ranking-diagnosis.md`](package/P5.40-00-audit-ground-truth-ranking-diagnosis.md)
6. [`work-instructions.md`](work-instructions.md), [`execution-state.json`](execution-state.json), and [`reports/README.md`](reports/README.md)
7. For the separately authorized Stage01, read [`P5.40-01-design-lock.md`](P5.40-01-design-lock.md) and [`package/P5.40-01-shadow-correction-design.md`](package/P5.40-01-shadow-correction-design.md)

The user-supplied package is preserved byte-for-byte under `package/`; its
checksum manifest is retained. Git and the current source/tests outrank stale
package assumptions.

## Stages

### P5.40-00 — Independent local ground truth and ranking diagnosis

Evaluation-only instrumentation and report. No correction or Promotion verdict.

### P5.40-01 — Shadow candidate-generation correction

Separately authorized after Stage00 PASS. Shadow-only; stop after focused validation.

### P5.40-02 — Shadow safety evaluation

Not authorized in this task.

### P5.40-03 — Promotion evaluation

Not authorized in this task.

### P5.40-04 — Production integration

Not authorized in this task; would require Promotion PASS and separate approval.

## Goal

Diagnose why the rejected local identity wins after an otherwise necessary
temporal partition, without changing the frozen P5.39 Shadow policy or
production. Independent local-state truth must precede any private-score
comparison.
