# Phase 4.7-01 Real Scope

Existing Dev 40 MIDI / 320 eventsを、raw candidate、canonical dedup、
Product Top-3、rank 1の全境界で測定した。Product変更、Validation、Holdout実行はない。

## Scope

| Metric | Value |
|---|---:|
| bass attachment events | 320 / 320 (100.0000%) |
| bass attachment candidates | 20800 |
| slash-only identities | 20800 |
| lost plain identities | 20800 |
| plain/slash coexist identities | 0 |
| provenance-eligible companions | 1770 |
| candidate pool impact | 25.7937% |
| applicable events | 289 / 320 (90.3125%) |
| Product Top-3 slash-only | 369 |
| Product rank 1 slash-only | 30 |
| existing pair competition events | 0 |
| raw rank 1 exact ties | 17 (5.3125%) |
| root-position / slash Gold | 320 / 0 |

## Candidate pool

- raw: 80640
- deduplicated: 80640
- canonical duplicate removed: 0
- rank 1 margin min / mean / max: 0.000000 / 0.046614 / 0.213478

## Family別 attachment candidates

| Family | Count |
|---|---:|
| 13 | 1600 |
| 7sus4 | 960 |
| add9 | 960 |
| aug | 640 |
| dim | 640 |
| dim7 | 960 |
| dom7 | 960 |
| dom9 | 1280 |
| m7 | 960 |
| m9 | 1280 |
| maj7 | 960 |
| maj9 | 1280 |
| min11 | 1600 |
| min6 | 960 |
| min7b5 | 960 |
| six | 960 |
| sixNine | 1280 |
| sus2 | 640 |
| sus4 | 640 |
| triad | 1280 |

## Bass pitch class別

| Pitch class | Count |
|---|---:|
| 0 | 4550 |
| 1 | 130 |
| 2 | 4420 |
| 4 | 2340 |
| 7 | 4680 |
| 9 | 4680 |

## Interpretation

automatic bass attachmentはcandidate生成時にcore identityをその場でslash化するため、
同じcoreのplain candidateはbaseline集合へ残らない。Part Aのapplicabilityは
Gold miss 28件より広く、candidate pool全体で測定する。
