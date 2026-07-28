# P4.4.2-02 Hypothesis A: Relative Support

- devだけで3候補を独立shadow評価
- Goldはsubset分類とmetricsだけに使用
- Bass role分類、Analyzer、製品経路は不変
- Validation / Holdout未実行

| ID | Ratio | Primary contamination reduction | Leak reduction | Recall Δ | Bass Δ | Top Δ | Register Δ | Exact Δ | General F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 | 0.25 | 100.00% | 100.00% | 0.25pp | 0.00pp | 12.50pp | 12.50pp | 17.05pp | 97.54% |
| A2 | 0.5 | 100.00% | 100.00% | 0.25pp | 0.00pp | 17.05pp | 17.05pp | 17.05pp | 97.54% |
| A3 | 0.75 | 100.00% | 100.00% | 0.00pp | 0.00pp | 17.05pp | 17.05pp | 17.05pp | 97.04% |

support count / duration / block / arpeggio / rootless / subset別結果と、既存60 MIDI・旧専用dev回帰はJSONへ保存した。
