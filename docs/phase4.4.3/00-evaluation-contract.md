# Phase 4.4.3-00 Evaluation Contract

この文書はPhase 4.4.3のMIDI評価を実行する前に固定する。
以後、CV結果を見て分類、閾値、Gate、昇格基準を変更しない。

## 1. 目的

Phase 4.4.2のHoldout結果を、単純な「効果なし」ではなく次の3軸に分離する。

1. Applicability: 介入の前提条件を満たした割合
2. Efficacy: 適用可能なイベントで改善した割合
3. Inertness: 適用範囲外で出力を変えなかった割合

既知Holdoutは`minimumSupportBeats = 0.2`に対して実測値が
`0.179167 beat`だったことが既知であるため、以後の閾値決定には使わない。
H/N/X分類と評価設計の診断入力としてのみ使う。

## 2. 現行coverageの定義

`filterRelativeSupportMelodyContamination()`の実装上、coverageは時間割合ではない。

```text
supportCoverageRatio =
  target note区間内で同時に成立した最強support pitch集合の要素数
  / event全体で利用可能なsupport pitch集合の要素数
```

- 分子: target note区間と重なるsupport voiceから、同一sub-intervalで同時に
  鳴っているdistinct MIDI pitch数の最大値
- 分母: event区間と重なるharmony / pad / mixed / polyphonic voiceの
  distinct MIDI pitch総数
- 同pitchを複数trackが保持しても1 pitchとして数える
- `minimumSupportBeats`はcoverageの一部ではなく、分子候補sub-intervalへ
  別途適用される絶対時間Gate

したがって、Phase 4.4.2 A1に残っていた絶対単位パラメータは
`minimumSupportBeats`だけである。

## 3. A1-prime

Phase 4.4.3で評価する介入はA1-prime 1案だけとする。

```text
minimumRoleConfidence    = 0.65
minimumSupportPitchCount = 1
minimumCoverageRatio     = 0.25
minimumSupportBeats      = removed
```

変更は`minimumSupportBeats`の削除だけとする。

- role推定を変更しない
- support voice定義を変更しない
- coverage分子・分母を変更しない
- chord analyzer、Timeline、boundary、aggregate、fallbackを変更しない
- N/Xクラス向けheuristicを追加しない
- Gold labelを製品判定へ使用しない
- source noteを追加しない
- Gate通過までshadowのまま維持する

## 4. H/N/X分類

分類はGold voicingの正解判定には使わず、介入の適用範囲を評価するために使う。

### H: harmony-supported

次をすべて満たすイベント。

- Product target roleが`melody`
- role confidence >= 0.65
- harmony support voiceが存在する
- target note区間のsupport pitch count >= 1

A1-primeの主評価対象。

### N: no-harmony

Product target roleとconfidenceはH条件を満たすが、次のいずれかに該当するイベント。

- harmony support voiceが存在しない
- target note区間のsupport pitch count = 0

A1-primeの適用範囲外。出力不変を要求する。

### X: role-misclassified

次のいずれかに該当するイベント。

- Product target roleが`melody`ではない
- role confidence < 0.65
- all-channel-zero / stem型track等によりrole evidence自体が診断対象

A1-primeの適用範囲外。出力不変を要求し、role修正はP4.4.3では行わない。

分類優先順位は`X -> N -> H`とする。どれにも入らない場合は`unclassified`として
Gateを失敗させる。

## 5. Leave-one-scenario-out CV

対象は`loop-vault-voicing-harmony-support-gold-v1`の16 scenario、256イベント。

- 1 foldにつき1 scenarioをtestとする
- 残り15 scenarioをtrain/referenceとして記録する
- 各scenarioはclean / stressの2 files、各8 eventsをまとめてtestへ置く
- 元のdev / validation / holdout splitはCVのfold決定には使わない
- 同一scenarioのclean / stressを別foldへ分離しない
- A1-primeは固定案であり、foldごとのパラメータ再選択を行わない
- 16 foldを独立して集計し、micro averageだけで合否を決めない

各foldで最低限次を報告する。

- scenario ID / slug
- H / N / X / unclassified件数
- applicability
- efficacy
- inertness
- contamination event before / after
- melody leak before / after
- Exact / Precision / Recall / F1
- Bass / Top / Register
- source note additions
- chord label / Timeline不変

## 6. Gate

### G-A Applicability

- HイベントのうちA1-primeが発火した割合を報告する
- fold applicability >= 30%: efficacyを判定
- fold applicability < 30%: efficacyは`inconclusive`とし、改善foldに数えない
- applicability不足は介入の適用範囲問題として記録し、即時回帰FAILとはしない

### G-B Efficacy

applicableなHイベントで次をすべて満たす。

- contamination event reduction >= 50%
- melody leak reduction > 0%
- Note Recall delta >= -0.5pp
- Bass Accuracy delta >= 0pp
- Top Note Accuracy delta >= -0.5pp
- Register Exact delta >= -0.5pp
- source note additions = 0

### G-C Inertness

N/Xイベントでは次をすべて満たす。

- filtered input note instance集合が完全一致
- final sourceVoicing pitch setが完全一致
- source statusが完全一致
- confidenceが完全一致
- winner durationが完全一致
- source note additions = 0

N/Xで1イベントでも変化したfoldは無条件FAIL。
N/Xが0件のfoldはinertnessを`not-applicable`として扱う。

### G-D 既存回帰

CV後に既存一般corpusを1回評価する。

- overall F1 delta >= -0.25pp
- Plain block Exact delta >= 0pp
- Rootless Exact delta >= -0.5pp
- Arpeggio F1 delta >= -0.5pp
- source note additions = 0

既知の旧専用Holdoutは開かない。

### G-E 不変条件

- chord label完全一致
- Timeline完全一致
- `defaultAnalyzerMode = "phase4-v1"`
- `fileVersion = 1`
- Vault schema不変
- boundary / aggregate / fallback不変

## 7. Fold判定

- `improved`: G-A適用可能かつG-B/G-C/G-E PASS
- `inconclusive`: applicability < 30%かつG-C/G-E PASS
- `regressed`: G-B、G-C、G-D、G-EのいずれかFAIL

## 8. 最終出口

16 foldの結果で次のいずれかを宣言する。

| 条件 | 判定 |
|---|---|
| improved >= 12、regressed = 0、G-D PASS | 製品昇格可能 |
| improved 8〜11、regressed = 0、G-D PASS | 条件付き昇格 |
| improved <= 7、またはregressed >= 1、またはG-D FAIL | 自動除去は停止 |

製品昇格可能でもA1-primeを自動接続するのはP4.4.3-06の判定後だけとする。
条件付き昇格では自動除去へ接続せず、表示・手動復帰導線のみ出荷可能とする。

## 9. Burned holdout方針

- Phase 4.4.2 HoldoutはH/N/X分類診断だけに使用
- A1-primeの閾値選択、CV合否、昇格可否には使用しない
- Holdout MIDIを再生成・変更しない
- Holdout結果を見てA1-primeを再調整しない
- 新しい独立Holdoutを将来追加する場合は、MIDIと注釈を作る前にscenarioとGateを
  別PRで固定する

## 10. 並行UIトラック

T1〜T3はCV結果に依存しないユーザー保護機能として別PRにする。

- T1: source status chip（元の響き / 自動 / 要確認）
- T2: `review` / `fallback`から「鍵盤で弾いて上書き」への導線
- T3: Dojoでusableなsource voicingを優先表示

表示・導線だけを変更し、抽出ロジック、保存schema、Analyzerへ触れない。
