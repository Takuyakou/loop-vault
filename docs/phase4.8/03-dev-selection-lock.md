# Phase 4.8-03 Existing Dev Selection Lock

## Variant Gate

| Variant | target recall | rescue | false generation | avg/max added | runtime relative | runtime ms/file | regression/plain/root | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| E1 | 80.00% | 32/40 | 0.71% | 0.1187/2 | 23.23% | 1.1496 | 0/0/0 | FAIL |
| E2 | 60.00% | 24/40 | 47.50% | 0.9125/2 | 23.62% | 1.1689 | 0/0/0 | FAIL |
| E3 | 57.50% | 23/40 | 41.43% | 0.7937/2 | 25.35% | 1.2545 | 0/0/0 | FAIL |

## Decision

- Selected variant: none
- Decision: non-promotion
- Product hash unchanged: true
- Validation / Holdout run: false / false
- Product connected: false

E1/E2/E3のrule、threshold、budgetはP4.8-00で固定した値から変更していない。
