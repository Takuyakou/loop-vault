# Phase 4.4 Baseline

専用holdoutは実行していない。専用corpusはGold boundaryで、A（Gold per-voice role）と
B（Product per-voice role）を比較する。既存60 MIDIはPhase 4.3で固定したCondition Bを
非回帰baselineとして再利用する。

## 専用Corpus

| Split / Condition | Exact | Precision | Recall | F1 | Melody leak | Usable | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
| dev A | 88.13% | 97.68% | 100.00% | 98.83% | 2.97% | 100.00% | 0.00% |
| dev B | 87.50% | 97.56% | 100.00% | 98.77% | 3.13% | 85.00% | 15.00% |
| validation A | 62.50% | 97.79% | 79.02% | 87.41% | 1.69% | 47.92% | 52.08% |
| validation B | 62.50% | 96.74% | 79.46% | 87.25% | 2.54% | 25.00% | 75.00% |

dev / validationはclean、stress、scenario、same-track / separate-track別の値を
`00-baseline.json`へ記録した。

## 既存60 MIDI非回帰Baseline

| Split | Exact | Precision | Recall | F1 | Melody leak | Usable | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
| dev B | 75.94% | 96.07% | 96.45% | 96.26% | 5.28% | 67.81% | 32.19% |
| validation B | 73.96% | 95.51% | 98.52% | 96.99% | 6.95% | 70.83% | 29.17% |

## 固定事項

- Analyzer: `phase4-v1`
- Gold boundaryを使用し、boundary改善は行わない
- schema変更なし、`fileVersion = 1`
- 専用holdout: not-evaluated
- 旧holdout: Phase 4.3の回帰確認専用
