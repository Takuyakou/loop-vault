# Phase 4.6-06 Counterfactual Competition

Shadow candidates were hypothetically inserted into the deduplicated pre-clamp raw ranking. Product was not changed.

## Rank 1

- changed: 3 / 320 (0.9375%)
- improved / regressed / neutral: 3 / 0 / 0
- tie-break-only: 3
- slash-only: 3
- root changed: 0
- plain stolen by altered: 0

## Ranking metrics

| Metric | Before | Counterfactual | Delta |
|---|---:|---:|---:|
| Top-3 canonical | 73.1250% | 75.0000% | 1.8750% |
| Top-3 root | 95.9375% | 95.9375% | 0.0000% |
| MRR | 0.675005 | 0.689571 | 0.014566 |

## Interpretation

Risk: **low-risk**.

No regression was observed, but Phase 4.6 forbids Product connection. Generated companions retain the source raw score, so changes caused by equal score are explicitly classified as tie-break-only. Detailed family, variant, scenario and event rows are in the JSON artifact.

Validation and Holdout were not run. Analyzer, Timeline, Product candidates, score, schema and Vault data remain unchanged.
