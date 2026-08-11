<!-- phase-id: 5.21.1 -->

# Contract 03 — Shadow / Promotion

Stage01 and Stage02 are shadow-only. They must not change production chord output for any preset.

The promotion gate is locked by P5.21.1-00 before any classifier result is available. Ground truth comes from the committed deterministic A-J generator; current predictions are never adopted as truth.

## Locked note-role gate

All synthetic notes must be evaluated and repeated runs must be exactly deterministic.

- protected harmonic/tension retention: `1.00`
- melody-like precision: `>= 0.95`
- harmonic retention (not classified melody-like): `>= 0.99`
- melody-like recall: `>= 0.60`
- uncertain-note non-suppression: `>= 0.90`
- Stage01/02 production outputs: exact unchanged

Risk order is fixed: protected retention, melody precision, harmonic retention, then melody recall. A single protected tension/inversion false suppression fails promotion.

## Locked official-corpus gate

The baseline is the P5.21 locked corpus: 100 clean and 1,100 dirty cases in `voice-aware-rerank-v1` mode.

Baseline aggregate:

- Root@1: `0.581897`
- Quality@1: `0.610453`
- Exact@1: `0.136853`
- boundary precision: `0.765475`
- boundary recall: `0.900864`

Root@1, Quality@1, and boundary precision/recall may not regress. Exact@1 decline may not exceed `0.0025` (0.25 percentage points). Missing, stale, partial, wrong-corpus, or non-deterministic evidence fails closed.

## Locked performance gate

Use the generated dense fixture and anonymous local real fixture. Run 3 warm-ups and 7 measured samples, record median/p95/max, do not hide timeouts, require median ratio `<= 2.0` against the Stage00 path and every sample `<= 2,000 ms`.

## Promotion result

If any gate fails:

- do not add production note weighting
- block Stage03+
- preserve existing P5.21 behavior
