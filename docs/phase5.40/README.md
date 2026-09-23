<!-- phase-id: 5.40 -->

# Phase 5.40 — Local Harmonic Identity / Partition Ranking Correction

## Status

- **Status:** Stage02c safe activation safety FAIL; P5.40 Closeout candidate
- **Active stage:** none
- **Completed stages:** P5.40-00, P5.40-01, P5.40-02, P5.40-02a, P5.40-02b, P5.40-02c
- **Base:** P5.39 failed-promotion Closeout at `77e0458a6893057b7ca6da125ad7875fd01e4605`
- **Current branch:** `feat/p540-local-harmonic-identity-ranking`
- **Stop boundary:** Stage02c Shadow safety FAIL; do not retune, begin Stage03, or modify production

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

Separately authorized after Stage00 PASS and completed as Shadow-only
candidate reachability. See [`Stage01 report`](reports/P5.40-01-shadow-generation.md).

### P5.40-02 — Shadow safety evaluation

Separately authorized and completed. **SHADOW SAFETY = FAIL.** See the
[`Stage02 report`](reports/P5.40-02-shadow-safety.md). This is not a Stage03
Promotion verdict.

### P5.40-02a — Shadow safety failure isolation

Separately authorized and completed as diagnosis only. **DIAGNOSIS =
SUFFICIENT** for the known failures; at closeout, one new anonymous region
awaited independent source-only classification. See the [`Stage02a report`](reports/P5.40-02a-failure-isolation.md).
The subsequent source-first human classification is documented by an
[`anonymous review receipt`](reports/P5.40-02a-source-review-receipt.md).
Candidate origin was unsealed only after that freeze, under the separate
Stage02b authorization.

### P5.40-02b — Final Shadow correction and safety re-evaluation

The separately authorized final Shadow-only correction round is complete.
**SHADOW SAFETY = FAIL.** See the
[`Stage02b report`](reports/P5.40-02b-final-shadow-safety.md) and the
pre-implementation [`design lock`](P5.40-02b-design-lock.md). The independent
classification remained frozen, production is unchanged, and the pre-locked
FAIL stop boundary was applied without another retune.

### P5.40-02c — Safe activation gate and final Shadow safety

Separately authorized after Stage02b FAIL. A source-evidence activation
certificate was locked before code and private evaluation. The one-time
whole-file result is **SHADOW SAFETY = FAIL**. See the
[`Stage02c report`](reports/P5.40-02c-safe-activation-safety.md) and
[`design lock`](P5.40-02c-design-lock.md). The local candidate correction
remains reachable, but activation/temporal arbitration is not safe
end-to-end. No post-result retune was made.

### P5.40-03 — Promotion evaluation

Not authorized in this task.

### P5.40-04 — Production integration

Not authorized in this task; would require Promotion PASS and separate approval.

## Goal

Diagnose why the rejected local identity wins after an otherwise necessary
temporal partition, without changing the frozen P5.39 Shadow policy or
production. Independent local-state truth must precede any private-score
comparison.
