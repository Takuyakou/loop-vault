# Contract 06 — Representability Oracle

## Purpose

Separate "the analyzer cannot represent this identity" from "the analyzer can
represent it but ranks it poorly".

## Oracle requirements

Shadow/test-only oracle takes a canonical target pitch-class identity + optional
slash bass and answers:

```text
REPRESENTABLE
NOT_REPRESENTABLE
AMBIGUOUS_BY_CONTRACT
```

with reason codes.

It must not inspect expected fixture labels during runtime scoring.
Expected labels are evaluation-only.

## Semantic comparison

Prefer canonical identity comparison over surface-string equality.
Surface notation and identity are reported separately.

## Coverage reporting

P5.39-00 remeasures current baseline. P5.39-01/02 report:
- current representability rate;
- target-family representability;
- newly representable identities;
- unchanged existing identities;
- parser/notation coverage;
- candidate-generation coverage.

Do not reuse stale historical percentages as current truth.
