# Phase 4.5-01 D1 Rank Distribution

Dev 40 MIDI / 320 eventsをcanonical identityで再集計した。

| Position | Count | Rate |
|---|---:|---:|
| Rank 1 | 195 | 60.9375% |
| Rank 2 | 31 | 9.6875% |
| Rank 3 | 0 | 0.0000% |
| Top-3 outside | 94 | 29.3750% |

- correct candidate absent from displayed Top-3: 94
- canonical-equivalent duplicate: 0
- MRR: 0.657813
- correctCandidateMeanRank: 1.137168

## Decision

Rank 3 exactは0.0000%で、事前分岐の1.0%以下。
「slot 3の正解寄与が低い」という仮説を支持するためD2へ進む。
Rank 1/2の値は生event行から再計算しており、Phase 4.3の丸め値から逆算していない。
