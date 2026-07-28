# Phase 4.4 M1 / M2 / M3 自動分類

Gold per-note role、Gold track role、Product role、実際にリークしたsource noteから自動分類した。
優先順はM1 → M2 → M3。scenario IDやファイルIDによる分岐はない。

| Mechanism | Dev events / notes | Validation events / notes | Dev precision loss | Dev usable loss |
|---|---:|---:|---:|---:|
| M1-same-track-role-mixing | 1 / 1 | 0 / 0 | 16.67% | 100.00% |
| M2-track-role-misclassification | 2 / 2 | 2 / 2 | 16.67% | 0.00% |
| M3-downstream-retention | 17 / 17 | 4 / 4 | 16.67% | 5.88% |

## 判断材料

- M1は同一物理Trackにharmonyとmelody/voiceのGold noteが共存する構造限界
- M2は純melody/voice TrackがProductでmelody以外になったclassifier損失
- M3はProduct roleがmelodyでもsourceVoicingへ残った下流損失
- validation再現: true
- 専用holdout: not-evaluated

イベント単位のsource track、Product role、leaked pitchはGit管理外の
`.local-evaluation/phase4.4/01-mechanism-events.json`へ保存した。
