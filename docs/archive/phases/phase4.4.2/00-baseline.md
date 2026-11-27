# P4.4.2-00 Product Baseline

## Scope

- corpus: `1.0.0`
- Product analyzer: `phase4-v1`
- 改善案評価: dev / validation / holdoutすべて未実行
- このStageはProduct baselineだけを測定した

| Split | Events | Contamination | Leak | Exact | Precision | Recall | F1 | Usable | Review | Fallback | Bass | Top | Register |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dev | 160 | 59 | 36.88% | 18.13% | 90.88% | 78.19% | 84.06% | 16.25% | 83.75% | 83.75% | 100.00% | 33.13% | 33.13% |
| validation | 48 | 36 | 75.00% | 25.00% | 80.65% | 78.13% | 79.37% | 0.00% | 100.00% | 100.00% | 100.00% | 25.00% | 25.00% |
| holdout | 48 | 18 | 18.75% | 62.50% | 92.04% | 100.00% | 95.85% | 33.33% | 66.67% | 66.67% | 100.00% | 62.50% | 62.50% |

詳細なclean/stress、support count、support duration、texture、subset別指標はJSONへ保存した。

## Safety

- finalPitchSetChangedRate / statusOnlyChangeRate / confidence delta / winner duration deltaはProduct単独baselineのため0
- sourceに存在しないnote追加は各splitで0 / 0 / 0
- Analyzer / Timeline / chord label / schema / fileVersionは変更していない
- 旧専用Holdoutの改善評価は実行していない
