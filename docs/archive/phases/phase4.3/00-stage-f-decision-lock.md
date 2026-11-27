# Stage F Decision Lock

Phase 4.3ではStage Fの判断を再審議しない。

| 項目 | 固定判断 |
|---|---|
| F0 | 内部分解は出力不変で採用済み |
| F1 | shadow診断基盤として保持 |
| F2 / F2R / F2W / F2A | 製品rootを上回らず非昇格 |
| F3a | quality決定器として悪化、非昇格 |
| F5a | tension precision悪化、非昇格 |
| F4 Primary root routing | 禁止 |
| 正式Analyzer | `phase4-v1` |

Phase 4.3で許される再利用はfailure分類、曖昧性診断、shadow evidenceの記録だけ。
factorized root / quality / tensionをPrimary、alternatives、Candidate rankingへ
接続しない。Stage Fの重みやglobal penaltyも変更しない。

実装上の固定点:

- `src/domain/midi/analysis.ts`
- `src/domain/midi/phase4Analyzer.ts`
- `src/domain/midi/factorized/*`
- `src/domain/midi/shadowTension.ts`
- `src/domain/midi/selectiveRootCorrection.ts`

このlockを解除するにはPhase 4.3とは別の評価計画とPRが必要である。
