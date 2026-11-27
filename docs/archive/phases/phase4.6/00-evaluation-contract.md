# Phase 4.6-00 Evaluation Contract

## Data

- Development and diagnostics: Phase 4.5 Fixed Gold Dev, 40 MIDI / 320 events.
- Existing Validation and Holdout are burned diagnostic-only and are not run.
- No Phase 4.6 Product promotion is permitted.
- A new target-family-balanced independent Gold corpus is required before Phase 4.7 connection research.

## Unit of evaluation

One Gold event mapped to the Product timeline item and raw two-beat diagnostic window with maximum interval IoU. Ties resolve to the earlier start.

Canonical identity includes root, triad, seventh, extensions, alterations and bass. Raw label spelling is retained separately.

## Product invariant

Before and after every Shadow evaluation, compare:

- rank 1 label and score hash
- displayed Top-3 labels and score hash
- all Product candidate labels, scores and count hash
- complete Analyzer output hash

Any difference is an immediate failure.

## Shadow generation contract

- Shadow candidates are held only in evaluation memory.
- Product candidates are immutable inputs.
- Generation is compositional, evidence-bound and deterministic.
- No symbol-, root- or scenario-specific branch is allowed.
- No tension powerset is allowed.
- Every generated identity must round-trip through the Product parser/serializer.
- Every generated extension must cite note instance IDs and pitch classes.

## Counterfactual contract

Counterfactual scoring is diagnostic only. A composed identity is scored with the same window evidence terms used by the existing matcher, extended to the explicit composed pitch-class set. Ordering is score descending, then canonical identity ascending. Ties and all rank changes are reported. The result never replaces Product output.

## Runtime and memory

Baseline and Shadow are measured in the same process and corpus run. Runtime Gate is Shadow overhead no greater than 20%. Heap delta is diagnostic because garbage collection is not forced.
