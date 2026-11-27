# Phase 4.6-04 Bounded Compositional Shadow Generator

Implemented `plain-minor-seventh-root-position-companion-v1` as an evaluation-only module under `scripts/phase46`.

## Contract

- source: existing slash-bass `min7` raw candidate
- output: same root and quality without bass
- complete note-instance provenance required for root, minor third, fifth and minor seventh
- generated candidates never feed Product, UI, Vault, Analyzer or another generated candidate
- score: the source raw score is retained only as `counterfactualScore`

## Bounds

- one candidate per source
- one candidate per root
- four candidates per event
- canonical duplicate: 0
- 12-source stress fixture generated: 4

## Transposition and determinism

- roots tested: 12
- roots generated and canonical round-tripped: 12 / 12
- deterministic: true
- provenance complete: true
- source input unchanged: true

Product generation, rank, score, Analyzer output, Timeline, schema and `fileVersion` remain unchanged.
