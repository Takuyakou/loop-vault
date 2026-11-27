# Phase 4.4.1 Root Cause Classification

## 結論

The 6 contaminated events are a disjoint cohort from the 7 review-to-usable events: their filter never triggers, so their note instances, pitch sets, Exact, and melody leak remain unchanged. In the 7 usable gains, filtering removes melody note instances that split simultaneous windows; the same harmonic contributor set then spans a longer winning window, raising the duration score and confidence across the usable threshold while the final pitch set stays unchanged.

6件すべてで最初の無効化Stageを自動決定した。複数の原因が同時に成立するため、`primaryClassification`に加えて`classifications`を保持する。

## 分類件数

- `filter-not-triggered`: 6
- `same-pitch-duplicate`: 0
- `unfiltered-rebuild`: 0
- `candidate-unchanged`: 6
- `status-only-change`: 0
- `missing-harmony-dominant`: 2
- `evaluator-provenance-mismatch`: 0

## Event分類

| Event | 最初の無効化Stage | Primary | 全分類 | instance変化 | filter pitch変化 | final pitch変化 | status変化 |
|---|---|---|---|---|---|---|---|
| M12_clean/e04 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged | no | no | no | no |
| M12_clean/e06 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged | no | no | no | no |
| M12_stress/e04 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged, missing-harmony-dominant | no | no | no | no |
| M12_stress/e06 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged, missing-harmony-dominant | no | no | no | no |
| M13_clean/e04 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged | no | no | no | no |
| M13_stress/e04 | filter-trigger | filter-not-triggered | filter-not-triggered, candidate-unchanged | no | no | no | no |

## 分類定義

- `filter-not-triggered`: filterがnote instanceを1件も除外しなかった
- `same-pitch-duplicate`: 除外pitchを別Trackのnote instanceが維持した
- `unfiltered-rebuild`: 除外IDがShadow winnerのprovenanceへ再出現した
- `candidate-unchanged`: candidateの表現・位置・長さ・pitch・bassが不変だった
- `status-only-change`: final pitch set不変でstatusだけ変化した
- `missing-harmony-dominant`: event内にharmony/pad/mixedまたはpolyphonic support voiceがなかった
- `evaluator-provenance-mismatch`: pitch-only leak評価が、除外distractorと同pitchの残存gold instanceを区別できなかった

## 判定

- 6件全Stage特定: true
- note instance / pitch set分離: true
- 製品経路不変: true
- Holdout未実行: true
