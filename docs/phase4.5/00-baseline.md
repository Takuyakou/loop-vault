# Phase 4.5 Dev Baseline

Phase 4.5開始時に`phase4-v1`、Dev 40 MIDI / 320 eventsで再測定した。
Phase 4.3の保存値と一致した。

| Metric | Result |
|---|---:|
| canonicalExact@1 | 60.9375% |
| root@1 | 94.6875% |
| top3Canonical | 70.6250% |
| top3Root | 98.1250% |
| MRR | 0.657813 |
| correctCandidateMeanRank | 1.137168 |
| rootDiversityAt3 | 2.05 |
| canonicalDiversityAt3 | 3.00 |
| correction cost mean / median / p90 | 0.76875 / 0 / 3 |
| manual input required | 12.50% |
| duplicate canonical identity | 0 |
| representableRate | 100.00% |

Correction category:

- primary: 195
- alternative: 44
- structure editor: 41
- manual input: 40
- unrepresentable: 0

生event行を含む実測値は`docs/phase4.5/00-baseline.json`。
