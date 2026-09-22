# Contract 03 — Shadow Strategy Comparison

P5.38-01 must compare bounded strategies before promotion.

## S0 — Legacy source-bar grouping

Baseline.

## S1 — Separate beat-based presentation grouping

Use a dedicated presentation grouping grid while preserving source bars.

Important: do not assume a universal 4-beat group without evidence.

Possible narrow policy for pathological 1/4 may be evaluated, but must be frozen before private evaluation.

## S2 — Harmonic-timeline-driven grouping

Group downstream blocks/text from already-resolved timeline regions / absolute beats rather than raw source-bar count.

This may be preferable if it avoids inventing meter semantics.

## S3 — Minimal hybrid

Source bars remain provenance; downstream output uses a separate stable grouping coordinate derived from absolute beats and existing product expectations.

## Required comparison

For each strategy report:
- source truth preserved?;
- 4/4 parity?;
- genuine 3/4 safety?;
- 1/4 fragmentation improvement?;
- harmonic identity unchanged?;
- block/text coherence?;
- implementation complexity?;
- rollback simplicity?;
- candidate for promotion?

Select exactly one policy for P5.38-02, or FAIL/BLOCK if none is safe.
