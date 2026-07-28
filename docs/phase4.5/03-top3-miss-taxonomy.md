# Phase 4.5-03 D3 Top-3 Miss Taxonomy

Top-3 misses: 94. The primary category is the first pipeline loss. Musical label differences are secondary and may overlap.

## Primary category

| Category | Count |
|---|---:|
| candidate-not-generated | 68 |
| canonical-dedup-loss | 0 |
| candidate-ineligible | 0 |
| same-root-ranked-too-low | 12 |
| alternative-root-allocation-loss | 14 |
| root-wrong | 0 |
| quality-family-wrong | 0 |
| seventh-wrong | 0 |
| tension-under | 0 |
| tension-over | 0 |
| slash-bass-wrong | 0 |
| canonical-equivalent | 0 |
| ambiguous | 0 |
| annotation-contract-issue | 0 |
| other | 0 |

Primary total: 94 / 94.

## Secondary musical differences

| Category | Count |
|---|---:|
| root-wrong | 17 |
| quality-family-wrong | 12 |
| seventh-wrong | 30 |
| tension-under | 53 |
| tension-over | 25 |
| slash-bass-wrong | 30 |

## Decision input

- allocation-editable misses: 26 (27.6596%; frozen minimum 50%)
- ambiguous or annotation-contract issues: 0 (0.0000%; frozen maximum 20%)
- allocation-editable gate: FAIL
- ambiguity/annotation gate: PASS

The JSON artifact contains clean/stress, scenario, root, candidate-presence and rank breakdowns for every miss.
