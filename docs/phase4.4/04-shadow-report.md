# Phase 4.4 Shadow Report

製品出力は変更していない。ShadowだけがProduct Voice roleに対してevent-local filterを
適用し、その後に現行extractVoicingを呼んだ。

## 初期設定

- role confidence >= 0.55
- monophonic Voice
- concurrent non-melody pitches >= 3
- concurrent support >= 0.1 beat

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
| Exact | 87.50% | 93.13% | 5.63pt |
| Precision | 97.56% | 98.64% | 1.08pt |
| Recall | 100.00% | 100.00% | 0.00pt |
| F1 | 98.77% | 99.32% | 0.55pt |
| Melody leak | 3.13% | 1.72% | -1.41pt |
| Usable | 85.00% | 85.00% | 0.00pt |

## 変更

- changed events: 9
- exact improved / regressed: 9 / 0
- output notes added / removed: 0 / 9
- sourceに存在しないnote追加: 0
- 専用holdout: not-evaluated

個別の削除理由とevent差分はGit管理外の
`.local-evaluation/phase4.4/04-shadow-events.json`へ保存した。
