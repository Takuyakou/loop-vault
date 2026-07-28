# Phase 5 Accuracy First 評価

## 結論

- Hybridがphase4-v1を1つ以上のCorpusで上回る: **YES** (phase4.5-label-dev, phase4.7-gold)
- R1が1つ以上のCorpusで改善: **YES** (chord-drip-100, phase4.5-label-dev, phase4.7-gold)
- R2が1つ以上のsplitで改善: **YES**
- 一般的な約3分MIDIで10秒超過: **endless/hybrid-v1**
- Hybrid採用Stage: **stopped-typical-midi-over-10s**
- Candidate union Stage: **not-started-dependent-hybrid-stage-stopped**
- 2週間の本人利用: **未完了（ユーザー確認が必要）**
- defaultAnalyzerMode: **変更なし（phase4-v1）**

解析速度は記録のみとし、Rank 1、Candidate Recall、Correction Cost、Manual input率を優先して比較した。

## 全モード精度

### chord-drip-100

100 files / 1058 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 26.09% | 37.62% | 41.40% | 1.649 | 33.08% | 711.3ms |
| legacy-boundary-rerank | 26.28% | 37.62% | 42.53% | 1.648 | 33.08% | 1071.7ms |
| voice-aware-rerank-v1 | 26.28% | 37.90% | 42.72% | 1.646 | 33.08% | 1065.2ms |
| hybrid-v1 | 26.09% | 35.35% | 38.75% | 1.683 | 33.08% | 17092.6ms |
| phase4-v1 | 27.88% | 40.26% | 44.71% | 1.598 | 33.08% | 664.5ms |
| phase4-v1+R1 | 27.88% | 40.26% | 44.80% | 1.599 | 33.08% | 624.7ms |

### chapter3-seed-100

100 files / 399 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 96.49% | 98.75% | 98.75% | 0.055 | 0.75% | 289.1ms |
| legacy-boundary-rerank | 96.49% | 99.00% | 99.25% | 0.053 | 0.75% | 510.0ms |
| voice-aware-rerank-v1 | 96.49% | 98.00% | 99.25% | 0.053 | 0.75% | 472.0ms |
| hybrid-v1 | 96.49% | 98.50% | 98.75% | 0.053 | 0.75% | 5380.5ms |
| phase4-v1 | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 254.3ms |
| phase4-v1+R1 | 97.74% | 98.75% | 99.00% | 0.040 | 0.75% | 279.6ms |

### phase4.5-label-dev

40 files / 320 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 62.81% | 70.63% | 73.44% | 0.750 | 12.50% | 214.2ms |
| legacy-boundary-rerank | 62.81% | 74.38% | 76.56% | 0.722 | 12.50% | 372.7ms |
| voice-aware-rerank-v1 | 63.13% | 74.06% | 77.50% | 0.706 | 12.50% | 374.7ms |
| hybrid-v1 | 62.81% | 67.81% | 73.75% | 0.741 | 12.50% | 4226.2ms |
| phase4-v1 | 60.94% | 70.63% | 73.13% | 0.769 | 12.50% | 199.1ms |
| phase4-v1+R1 | 60.94% | 70.63% | 80.00% | 0.700 | 12.50% | 203.2ms |

### phase4.7-gold

36 files / 288 annotated events.

| Mode | Rank 1 | Top-3 | Candidate Recall | Correction mean | Manual input | Runtime |
|---|---:|---:|---:|---:|---:|---:|
| legacy | 3.82% | 4.51% | 5.56% | 1.906 | 0.00% | 306.9ms |
| legacy-boundary-rerank | 3.82% | 7.64% | 8.68% | 1.872 | 0.00% | 507.5ms |
| voice-aware-rerank-v1 | 3.82% | 7.64% | 7.64% | 1.885 | 0.00% | 488.9ms |
| hybrid-v1 | 3.82% | 6.60% | 6.94% | 1.889 | 0.00% | 6757.0ms |
| phase4-v1 | 3.82% | 4.51% | 4.51% | 1.917 | 0.00% | 303.7ms |
| phase4-v1+R1 | 3.82% | 4.51% | 8.68% | 1.875 | 0.00% | 305.1ms |

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
| all-instruments | 104 | 208.0s | legacy | 117.0ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | legacy-boundary-rerank | 173.9ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | voice-aware-rerank-v1 | 171.6ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | hybrid-v1 | 6802.1ms | 177 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1 | 80.6ms | 179 | 10 | PASS |
| all-instruments | 104 | 208.0s | phase4-v1+R1 | 86.4ms | 179 | 10 | PASS |
| captured-chorus | 9 | 16.6s | legacy | 5.2ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | legacy-boundary-rerank | 11.9ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | voice-aware-rerank-v1 | 12.6ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | hybrid-v1 | 368.8ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1 | 5.7ms | 14 | 6 | PASS |
| captured-chorus | 9 | 16.6s | phase4-v1+R1 | 5.9ms | 14 | 6 | PASS |
| suran-remix | 100 | 208.7s | legacy | 68.7ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | legacy-boundary-rerank | 148.9ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | voice-aware-rerank-v1 | 162.1ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | hybrid-v1 | 6939.6ms | 162 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1 | 77.4ms | 168 | 10 | PASS |
| suran-remix | 100 | 208.7s | phase4-v1+R1 | 75.7ms | 168 | 10 | PASS |
| endless | 154 | 295.7s | legacy | 107.8ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | legacy-boundary-rerank | 231.5ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | voice-aware-rerank-v1 | 240.4ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | hybrid-v1 | 12655.4ms | 235 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1 | 108.7ms | 236 | 12 | PASS |
| endless | 154 | 295.7s | phase4-v1+R1 | 121.1ms | 236 | 12 | PASS |

## 安全性

- Vault schema / fileVersion: 変更なし
- 保存済み進行の再解析・自動書換え: なし
- Live MIDI / Chord Dojo経路: 変更なし
- private MIDI / 絶対パス: 成果物へ未収録

## 指標の意味

- Rank 1: 保存前の主コードがcanonical identityで正解
- Top-3: 主コードと先頭2候補内に正解
- Candidate Recall: Productが表示可能な先頭5候補内に正解
- Correction mean: 候補選択1、構造編集2、手入力3、表現不能4の平均
- Manual input: 手入力または表現不能が必要なイベント率
