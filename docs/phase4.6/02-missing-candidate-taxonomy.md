# Phase 4.6-02 Missing Candidate Taxonomy

The 68 raw-generation misses from the frozen Dev funnel were decomposed without changing Product generation or ranking.

## Primary classification

- `alteration-generation-missing`: 40
- `slash-bass-generation-missing`: 28

## Family summary

| Gold family | Gold | Missing | Missing rate | Scenarios | Clean / Stress | Root correct | Primary |
|---|---:|---:|---:|---:|---:|---:|---|
| A7b9 | 40 | 40 | 100.0000% | 20 | 20 / 20 | 34 | alteration-generation-missing: 40 |
| Am9 | 40 | 6 | 15.0000% | 3 | 3 / 3 | 6 | slash-bass-generation-missing: 6 |
| Cmaj9 | 40 | 2 | 5.0000% | 1 | 1 / 1 | 2 | slash-bass-generation-missing: 2 |
| Dm7 | 40 | 6 | 15.0000% | 3 | 3 / 3 | 3 | slash-bass-generation-missing: 6 |
| Dm9 | 40 | 4 | 10.0000% | 2 | 2 / 2 | 4 | slash-bass-generation-missing: 4 |
| Em7 | 40 | 2 | 5.0000% | 1 | 1 / 1 | 0 | slash-bass-generation-missing: 2 |
| G13 | 40 | 2 | 5.0000% | 1 | 1 / 1 | 2 | slash-bass-generation-missing: 2 |
| G7sus4 | 40 | 6 | 15.0000% | 3 | 3 / 3 | 6 | slash-bass-generation-missing: 6 |

## Interpretation

- Root-position identities can be absent even when the same root, triad, seventh and tensions exist as a slash candidate.
- Altered dominant candidates are a separate vocabulary gap and are not combined with the root-position companion target.
- Fixed Gold covers 5 distinct roots in these misses. Twelve-key reproducibility cannot be claimed from this corpus and must be established with deterministic synthetic tests.
- Product rank, score, Analyzer output, schema and Timeline were not changed. Validation and Holdout were not run.

The JSON artifact contains component-level signals, evidence pitch sets, nearest same-root candidates and scenario metadata for all 68 events.
