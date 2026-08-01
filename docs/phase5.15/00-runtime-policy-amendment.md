# Phase 5.15 Runtime Policy Amendment

この文書は、Phase 5.15 の既存指示に対する正式な追補である。既存指示と競合する場合は、この追補を優先する。

## 優先順位

Phase 5.15では、次の優先順位を使用する。

1. 検出correctness
2. 既存正解ケースの非退行
3. deterministic / reproducibility
4. データ・Git・resource safety
5. runtime
6. 実装量・短期的な開発速度

処理時間を短くするために、検出精度を落としたり、正しいコードを誤検出へ戻したりしてはならない。

## 採用基準

Analyzer改善は、次を満たした場合に採用する。

- correctnessの新規退行が0件
- 事前に定めた対象不具合を1件以上改善する
- invariant pairがすべてPASS
- deterministicである
- memory leak、resource leak、UI freezeがない
- rollback可能である

処理時間が増加したことだけを理由に不採用にしてはならない。

## StableとAccuracy First

### Stable

既存の高速処理契約を原則維持する。

- 既存runtime Gateを維持
- 大幅に遅くなる改善は原則ONにしない
- 精度と速度の両方が安全な機能のみ採用候補

既存の「3分MIDI 10秒Gate維持」という記述は、Stable profileだけに適用する。

### Accuracy First

検出精度を優先し、大幅な処理時間増を許容する。

- 既存の「3分MIDI 10秒Gate」はAccuracy Firstには適用しない
- 精度改善が確認できる場合、runtime増加だけでは不採用にしない
- 3分MIDIの暫定基準は次とする

  - 60秒以内: 通常採用可能
  - 60〜180秒: 採用可能。増加理由と精度改善量を報告
  - 180〜300秒: 条件付き採用。進捗表示、キャンセル、UI非ブロックを必須
  - 300秒超: Product既定値にはしない。実験機能として結果を報告し停止判定

これは暫定上限であり、10秒を超えたこと自体をfailureにしてはならない。

## UI応答性

解析が長時間化しても次を必須とする。

- UI threadをblockしない
- 1秒以上かかる場合は進捗状態を表示できる構造
- キャンセル可能
- 二重解析を開始しない
- route移動やapp終了時にresourceを安全に解放
- 完了まで結果を捏造しない
- timeoutを通常の検出失敗と混同しない

Phase 5.15でUI実装を増やさない場合でも、長時間処理に対応可能なapplication contractを壊さないこと。

## 計測方法

runtimeは1回の値で判定しない。

- warm-upを分離
- 同一条件で複数回実行
- median / p95 / maxを報告
- baselineとの倍率を報告
- 入力MIDI、Analyzer config、feature flagsを固定
- CPU競合などの外れ値を記録
- 精度改善量とruntime増加量を同じ表に記載

## 最適化順序

1. correctnessを完成させる
2. regressionを0にする
3. deterministicを確認する
4. profilerでbottleneckを特定する
5. 精度を変えない最適化だけを行う
6. 最後にStable / Accuracy Firstへの接続を決める

accuracyを犠牲にした早期最適化は禁止する。

## P5.15-01への適用

P5.15-01 Exact Note Evidence Dedupでは、

- case 02 / 03 deep equal
- intentional unisonを削除しない
- provenance維持
- correctness退行0

を最優先する。

dedup後にruntimeまたはmemoryが改善すれば記録するが、runtime改善をP5.15-01の必須採用条件にはしない。

runtimeが増加しても、原因が追跡可能で、resource leakがなく、correctness退行0かつ対象不具合を改善する場合は採用候補とする。

## 永続化

次へこの方針を記録する。

- Phase 5.15のactive work-instructions
- `docs/CURRENT_STATE.md`
- `docs/phase5.15/00-runtime-policy-amendment.md`

既存の「3分MIDI 10秒Gate維持」という記述は、Stable profileだけに適用される。
