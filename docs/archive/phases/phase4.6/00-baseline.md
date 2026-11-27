# Phase 4.6-00 Baseline

Dev 40 MIDI / 320 events. Product `phase4-v1` was rerun without Shadow candidates.

## Recall Funnel

- raw / canonical / eligible / same-root recall: 78.7500%
- displayed Top-3 canonical: 70.6250%
- raw candidate missing: 68

## Product invariant fingerprints

- rank 1 hash: `a4166c993a81e4573072eeb05b8db088a56f5ab0d6db15db748fa5fed4b76d63`
- Top-3 hash: `fd30ae6acf63c9e04dbc1810e0097949584ecbbdc6b15cbf8242a38b944209fc`
- all product candidates + scores hash: `11007e43ea40c2b08dbbf1ff03d3f0497ce73c32edbce6f80329233472e49b45`
- analyzer output hash: `c841bf9fc416a13ad7dec935fb8bd740d347a7920dec580684b0c06d073951d7`
- product candidate count total / mean / min / max: 1920 / 6.0000 / 6 / 6
- canonical duplicate: 0

## Performance

- runtime: 300.192 ms
- runtime per event: 0.938102 ms
- observed peak heap delta: 41885088 bytes

Runtime and heap are environment-sensitive baselines. P4.6 compares Shadow generation in the same process and run.

## Family distribution

| Gold label | Gold | Missing | Missing rate | Scenarios | Clean / Stress missing |
|---|---:|---:|---:|---:|---:|
| A7b9 | 40 | 40 | 100.0000% | 20 | 20 / 20 |
| Am9 | 40 | 6 | 15.0000% | 3 | 3 / 3 |
| Cmaj9 | 40 | 2 | 5.0000% | 1 | 1 / 1 |
| Dm7 | 40 | 6 | 15.0000% | 3 | 3 / 3 |
| Dm9 | 40 | 4 | 10.0000% | 2 | 2 / 2 |
| Em7 | 40 | 2 | 5.0000% | 1 | 1 / 1 |
| G13 | 40 | 2 | 5.0000% | 1 | 1 / 1 |
| G7sus4 | 40 | 6 | 15.0000% | 3 | 3 / 3 |
