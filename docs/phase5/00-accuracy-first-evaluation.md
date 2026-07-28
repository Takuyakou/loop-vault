# Phase 5 Accuracy First 評価

## 結論

- Hybridがphase4-v1を1つ以上のCorpusで上回る: **YES** (phase4.5-label-dev, phase4.7-gold)
- R1が1つ以上のCorpusで改善: **YES** (chord-drip-100, phase4.5-label-dev, phase4.7-gold)
- R2が1つ以上のsplitで改善: **YES**
- 一般的な約3分MIDIで10秒超過: **なし**
- Hybrid採用Stage: **not-selected-correction-cost-not-improved**
- Candidate union Stage: **implemented-without-hybrid**
- 2週間の本人利用: **未完了（ユーザー確認が必要）**
- defaultAnalyzerMode: **変更なし（phase4-v1）**

解析速度は記録のみとし、Rank 1、Candidate Recall、Correction Cost、Manual input率を優先して比較した。

## 全モード精度

### chord-drip-100

100 files / 1058 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 26.09% | 37.62% | 41.40% | 1.649 | 33.08% | 942.2ms |
| legacy-boundary-rerank | 26.28% | 37.62% | 42.53% | 1.648 | 33.08% | 1680.8ms |
| voice-aware-rerank-v1 | 26.28% | 37.90% | 42.72% | 1.646 | 33.08% | 1765.2ms |
| hybrid-v1 | 26.09% | 35.35% | 38.75% | 1.683 | 33.08% | 26204.9ms |
| phase4-v1 | 27.88% | 40.26% | 44.71% | 1.598 | 33.08% | 892.7ms |
| phase4-v1+R1 | 27.88% | 40.26% | 44.80% | 1.599 | 33.08% | 890.3ms |
| phase4-v1+R1+E1 | 27.88% | 40.26% | 44.80% | 1.597 | 32.89% | 912.6ms |
| phase4-v1+R1+E1+Union | 27.88% | 40.26% | 44.80% | 1.597 | 32.89% | 4333.2ms |
| phase4-v1+R1+E1+Union+Hybrid | 27.88% | 40.26% | 44.80% | 1.597 | 32.89% | 33020.6ms |

### chapter3-seed-100

100 files / 399 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 96.49% | 98.75% | 98.75% | 0.055 | 0.75% | 486.6ms |
| legacy-boundary-rerank | 96.49% | 99.00% | 99.25% | 0.053 | 0.75% | 754.7ms |
| voice-aware-rerank-v1 | 96.49% | 98.00% | 99.25% | 0.053 | 0.75% | 679.6ms |
| hybrid-v1 | 96.49% | 98.50% | 98.75% | 0.053 | 0.75% | 9134.0ms |
| phase4-v1 | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 398.8ms |
| phase4-v1+R1 | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 392.9ms |
| phase4-v1+R1+E1 | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 400.0ms |
| phase4-v1+R1+E1+Union | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 1764.1ms |
| phase4-v1+R1+E1+Union+Hybrid | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 10213.6ms |

### phase4.5-label-dev

40 files / 320 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 62.81% | 70.63% | 73.44% | 0.750 | 12.50% | 277.3ms |
| legacy-boundary-rerank | 62.81% | 74.38% | 76.56% | 0.722 | 12.50% | 516.9ms |
| voice-aware-rerank-v1 | 63.13% | 74.06% | 77.50% | 0.706 | 12.50% | 556.2ms |
| hybrid-v1 | 62.81% | 67.81% | 73.75% | 0.741 | 12.50% | 6364.3ms |
| phase4-v1 | 60.94% | 70.63% | 73.13% | 0.769 | 12.50% | 300.7ms |
| phase4-v1+R1 | 60.94% | 70.63% | 80.00% | 0.700 | 12.50% | 271.8ms |
| phase4-v1+R1+E1 | 60.94% | 70.63% | 90.00% | 0.494 | 1.88% | 305.2ms |
| phase4-v1+R1+E1+Union | 60.94% | 70.63% | 90.00% | 0.494 | 1.88% | 1367.6ms |
| phase4-v1+R1+E1+Union+Hybrid | 60.94% | 70.63% | 90.00% | 0.494 | 1.88% | 7847.9ms |

### phase4.7-gold

36 files / 288 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 3.82% | 4.51% | 5.56% | 1.906 | 0.00% | 411.4ms |
| legacy-boundary-rerank | 3.82% | 7.64% | 8.68% | 1.872 | 0.00% | 706.5ms |
| voice-aware-rerank-v1 | 3.82% | 7.64% | 7.64% | 1.885 | 0.00% | 712.5ms |
| hybrid-v1 | 3.82% | 6.60% | 6.94% | 1.889 | 0.00% | 10549.0ms |
| phase4-v1 | 3.82% | 4.51% | 4.51% | 1.917 | 0.00% | 435.1ms |
| phase4-v1+R1 | 3.82% | 4.51% | 8.68% | 1.875 | 0.00% | 434.6ms |
| phase4-v1+R1+E1 | 3.82% | 4.51% | 8.68% | 1.875 | 0.00% | 456.4ms |
| phase4-v1+R1+E1+Union | 3.82% | 4.51% | 8.68% | 1.875 | 0.00% | 1842.1ms |
| phase4-v1+R1+E1+Union+Hybrid | 3.82% | 4.51% | 8.68% | 1.875 | 0.00% | 12289.3ms |

## Candidate Union

Product採用modeは `legacy-boundary-rerank` と
`voice-aware-rerank-v1`。Hybridは比較だけに含め、Product Unionから除外した。
Primaryのrank 1と既存Top-3順は固定し、canonical identityでdedupしている。

| Corpus | Baseline catalog recall | Union recall | Union + Hybrid | Catalog rescue | Catalog manual input | Duplicates | Max/event |
|---|---:|---:|---:|---:|---:|---:|---:|
| chord-drip-100 | 46.50% | 51.32% | 52.08% | 69 | 32.89% | 0 | 26 |
| chapter3-seed-100 | 99.25% | 99.25% | 99.25% | 1 | 0.75% | 0 | 14 |
| phase4.5-label-dev | 91.56% | 95.31% | 95.31% | 17 | 1.88% | 0 | 15 |
| phase4.7-gold | 8.68% | 13.19% | 13.19% | 13 | 0.00% | 0 | 16 |

## R2 ボイシング混入フィルタ

保守版A1（minimumSupportBeats=0.2）だけを評価した。A1-primeは使用していない。

| Split | Exact before | Exact R2 | F1 before | F1 R2 | Melody leak before | Melody leak R2 |
|---|---:|---:|---:|---:|---:|---:|
| dev | 18.13% | 32.50% | 84.06% | 86.49% | 36.88% | 13.13% |
| validation | 25.00% | 45.83% | 79.37% | 81.52% | 75.00% | 54.17% |
| holdout | 62.50% | 66.67% | 95.85% | 96.30% | 18.75% | 16.67% |

## 実MIDI性能・決定性

実MIDI本体、絶対パス、解析内容は成果物へ保存していない。

| File alias | Bars | Estimated duration | Mode | Runtime | Timeline | Blocks | Deterministic |
|---|---:|---:|---|---:|---:|---:|---|
| all-instruments | 104 | 208.0s | legacy | 102.6ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | legacy-boundary-rerank | 286.4ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | voice-aware-rerank-v1 | 288.1ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | hybrid-v1 | 11191.8ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1 | 116.8ms | 179 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1+R1 | 117.2ms | 179 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1+R1+E1 | 116.8ms | 179 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1+R1+E1+Union | 665.5ms | 179 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1+R1+E1+Union+Hybrid | 11606.8ms | 179 | 10 | PASS |
| captured-chorus | 9 | 16.6s | legacy | 7.8ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | legacy-boundary-rerank | 16.3ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | voice-aware-rerank-v1 | 16.8ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | hybrid-v1 | 584.0ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1 | 7.8ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1+R1 | 8.9ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1+R1+E1 | 8.1ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1+R1+E1+Union | 42.4ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1+R1+E1+Union+Hybrid | 636.4ms | 14 | 6 | PASS |
| suran-remix | 100 | 208.7s | legacy | 149.1ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | legacy-boundary-rerank | 262.2ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | voice-aware-rerank-v1 | 263.5ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | hybrid-v1 | 11273.8ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1 | 107.1ms | 168 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1+R1 | 108.9ms | 168 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1+R1+E1 | 112.0ms | 168 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1+R1+E1+Union | 609.4ms | 168 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1+R1+E1+Union+Hybrid | 11581.7ms | 168 | 10 | PASS |
| endless | 154 | 295.7s | legacy | 154.6ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | legacy-boundary-rerank | 345.6ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | voice-aware-rerank-v1 | 359.0ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | hybrid-v1 | 21061.4ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1 | 164.2ms | 236 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1+R1 | 165.9ms | 236 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1+R1+E1 | 168.2ms | 236 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1+R1+E1+Union | 880.1ms | 236 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1+R1+E1+Union+Hybrid | 21760.6ms | 236 | 12 | PASS |

## 安全性

- Vault schema / fileVersion: 変更なし
- 保存済み進行の再解析・自動書換え: なし
- Live MIDI / Chord Dojo経路: 変更なし
- private MIDI / 絶対パス: 成果物へ未収録

## 指標の意味

- Rank 1: 保存前の主コードがcanonical identityで正解
- Top-3: 主コードと先頭2候補内に正解
- Candidate Recall: Productが表示可能な先頭5候補内に正解
- Union Candidate Recall: 展開式Candidate Catalog（最大32件）内に正解
- Correction mean: 候補選択1、構造編集2、手入力3、表現不能4の平均
- Manual input: 手入力または表現不能が必要なイベント率
