# Phase 5.15 Active Work Instructions

このファイルは、リポジトリ内で追跡する Phase 5.15 の正式な active work-instructions である。基礎計画は **Loop Vault Phase 5.15 v2 FINAL — Analyzer Accuracy Hardening / One-Pass Evaluation Plan** とし、競合する runtime 方針については、このファイルに収録した **Phase 5.15 Runtime Policy Amendment** を優先する。

## 基礎計画の参照コンテキスト

Stage は次の順序で、前 Stage を base とする stacked branch / PR として進める。Stage を飛ばしたり、複数 Stage を同時実装したり、main へ merge したりしない。

1. P5.15-00 Preflight / Data Audit / Baseline Freeze
2. P5.15-01 Exact Note Evidence Dedup
3. P5.15-02 Event-Local Tension Evidence
4. P5.15-03 Syncopated / Irregular Boundary Candidates
5. P5.15-04 Shell Seventh Preference
6. P5.15-05 Suspended Quality Disambiguation
7. P5.15-06 Combined Matrix / Holdout / Product Decision
8. P5.15-07 Full Regression / Runtime / Build / Final Report

P5.15-00 は commit `b1862816f8d8d80f8d04f72eb3ee919007f33cd5` で完了済みであり、やり直さない。評価契約、partition、baseline、runtime baseline は同じディレクトリの `00-*.md` / `00-*.json` を正本とする。Holdout は P5.15-06 まで評価せず、fresh Phase 4.7 Holdout の結果を開かない。

保護契約:

- `fileVersion = 1`、Vault schema、UI、MIDI Exporter、raw MIDI、Piano Roll source notes、保存データを不用意に変更しない
- 各機能は独立 feature flag とし、既定 OFF、deterministic、provenance 保持、rollback 可能とする
- test MIDI、personal MIDI、`.local-evaluation`、build artifact、個人情報を追跡しない
- `git add -A`、force push、history rewrite、main merge を禁止する
- 通常の失敗は自律的に修正し、明示された Gate 失敗時だけ停止する

既存の「3分MIDI 10秒Gate維持」は **Stable profile にだけ適用する**。Accuracy First には適用せず、10秒超だけを failure としない。以降の実装・検証・採用判定には、次の追補全文を適用する。

---

# Phase 5.15 Runtime Policy Amendment

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

---

# Base Phase 5.15 v2 Instructions

以下は基礎計画 **Loop Vault Phase 5.15 v2 FINAL** の全文である。基礎計画内の runtime Gate、採用条件、停止条件が上記 Runtime Policy Amendment と競合する場合は、上記追補を優先する。特に「3分MIDI 10秒Gate維持」「runtime Gate PASS」「runtime Gate超過」は Stable profile にだけ適用し、Accuracy First の不採用・failure・停止理由には単独で使用しない。

# Loop Vault Phase 5.15 v2 FINAL 作業指示書
## Analyzer Accuracy Hardening — One-Pass Evaluation Plan

この文書をPhase 5.15の最終仕様の正とする。

Phase 5.15は、Phase 5.14で完成したMIDI Export / Round-trip基盤と、次の評価データを一括利用し、Analyzerの既知欠陥を改善する。

```text
基本合成Corpus          12 MIDI
追加合成Corpus          24 MIDI
Phase 5.14 Round-trip   21 timeline events
既存の全評価Corpus
最終実曲smoke           3 MIDI以内
```

このフェーズの目的は、特定の1曲だけを直すことではない。

次を同時に達成する。

1. pickup・0.5拍・1.5拍・tripletを含む境界を正しく扱う
2. `root + 3rd + 7th`のシェルコードを未観測の11th / 13thへ過剰拡張しない
3. 完全重複ノートによる証拠の過大評価を排除する
4. 一瞬の経過音と、持続した真のテンションを区別する
5. 真のslash / pedal / rootless chordを壊さない
6. `sus2 / add9`、`sus4 / 7sus4`を観測音から分類する
7. PPQ、velocity、track順、tempo、拍子に対する不変性を確保する
8. Live MIDI、Chord Dojo、Vault、MIDI Exporterを退行させない

本フェーズではUI、Vault schema、MIDI Exporterの出力契約を変更しない。

---

# 0. 最終方針

Phase 5.15は、途中で方針を行き来しないよう、次の順番を固定する。

```text
P5.15-00  Preflight / Data Audit / Baseline Freeze
P5.15-01  Exact Note Evidence Dedup
P5.15-02  Event-Local Tension Evidence
P5.15-03  Syncopated / Irregular Boundary Candidates
P5.15-04  Shell Seventh Preference
P5.15-05  Suspended Quality Disambiguation
P5.15-06  Combined Matrix / Holdout / Product Decision
P5.15-07  Full Regression / Runtime / Build / Final Report
```

必須ルール:

- Stageを飛ばさない
- 複数Stageを同時実装しない
- 先に評価契約を固定する
- thresholdを変更する前に候補値を宣言する
- holdoutを見ながら調整しない
- 合成36件だけでProduct採用を決めない
- 途中でユーザーへ反復QAを依頼しない
- 自動化不能な実機確認は最後に1回だけ行う
- Gate失敗時だけ停止する
- Phase 5.2へ進まない
- mainへマージしない

---

# 1. 着手前のPreflight

## 1.1 Phase 5.14の状態確認

Phase 5.14 stack:

```text
#344 → #345 → #346 → #347 → #348 → #349
```

推奨:

1. #344〜#349を依存順にmainへ統合
2. mainで全test / Web build / Tauri build
3. FL Studio native drag smokeを1回実施
4. 最新mainからPhase 5.15を開始

未マージで進める場合:

- #349最終branchをbase
- Phase 5.15を追加stack
- 既存PRを書き換えない
- 最終報告へ依存関係を明記
- mainへ未マージで停止

## 1.2 Phase 5.14 FL Studio smoke

Phase 5.15開始前に1回だけ行う。

確認:

1. Progression DetailのMIDI controlをFL Studioへdrag
2. MIDI clipが生成される
3. chord数が一致
4. clip長が一致
5. 再生できる
6. click保存した`.mid`と同じ内容

失敗した場合:

- Phase 5.14の問題として修正
- Analyzer作業を開始しない
- Phase 5.15へ混ぜない

成功した場合、Phase 5.15中に同じ確認を繰り返さない。

---

# 2. 評価データの正式構成

## 2.1 基本合成Corpus 12件

想定配置:

```text
test/phase5.15/
```

必須:

```text
manifest.json
phase514_roundtrip_seeds.json
midi/01_shell_fifths_aligned.mid
midi/02_shell_fifths_pickup_irregular.mid
midi/03_shell_fifths_pickup_irregular_exact_duplicates.mid
midi/04_adjacent_chord_false_tension_trap.mid
midi/05_fleeting_tensions_do_not_promote.mid
midi/06_true_sustained_tensions.mid
midi/07_legitimate_slash_pedal.mid
midi/08_same_chord_rearticulation.mid
midi/09_halfbeat_boundary_changes.mid
midi/10_phase514_roundtrip_basic.mid
midi/11_phase514_roundtrip_complex.mid
midi/12_split_tracks_harmony_bass.mid
```

役割:

- 既知不具合の再現
- duplicate invariance
- false tension
- true tension
- slash反証
- pickup / 0.5拍 / 1.5拍境界
- Phase 5.14 round-trip

## 2.2 追加合成Corpus 24件

想定配置:

```text
test/phase5.15-supplemental/
```

必須:

```text
manifest-supplemental.json
midi/13_major7_shells.mid
midi/14_minor7_shells.mid
midi/15_rootless_dominant_with_context.mid
midi/16_arpeggiated_shells.mid
midi/17_common_tone_legato_boundary.mid
midi/18_melody_contamination_separate_track.mid
midi/19_chromatic_bass_approach_notes.mid
midi/20_true_pedal_bass_slash_progression.mid
midi/21_sustain_pedal_overlap.mid
midi/22_triplet_boundaries.mid
midi/23_meter_3_4.mid
midi/24_meter_6_8.mid
midi/25_tempo_change_mid_file.mid
midi/26_ppq96_equivalence.mid
midi/27_ppq960_equivalence.mid
midi/28_velocity_low.mid
midi/29_velocity_high.mid
midi/30_track_order_harmony_first.mid
midi/31_track_order_bass_first.mid
midi/32_type0_multichannel.mid
midi/33_sus2_vs_add9.mid
midi/34_sus4_vs_7sus4.mid
midi/35_nc_silence_region.mid
midi/36_long_three_minute_stability.mid
```

役割:

- major7 / minor7 shell
- rootless
- arpeggiation
- common-tone legato
- melody contamination
- chromatic bass approach
- pedal slash
- sustain pedal
- triplet
- 3/4 / 6/8
- tempo change
- PPQ invariance
- velocity invariance
- track-order invariance
- SMF Type 0
- sus / add
- N.C.
- runtime / memory

## 2.3 既存Corpus

必ず併用する。

- Chord Drip Corpus
- Chapter 3
- Phase 4.5
- Phase 4.7
- Existing Voicing Gold Corpus
- Phase 5 Accuracy First Corpus
- Candidate Union evaluation corpus
- Phase 5.14 Round-trip vocabulary matrix
- SURAN
- Endless
- all-instruments evaluation set
- 40-file batch

見つからないCorpusがある場合:

- 名前だけで新規作成しない
- repository内の実在pathと定義を監査
- 廃止済みなら理由を報告
- 同等Corpusへ無断置換しない

## 2.4 最終実曲smoke

全自動Gate後に最大3件だけ行う。

1. シェルコード中心
2. 真のテンションが多い曲
3. harmony / bass / melodyを含む全部入りMIDI

目的:

- 合成データへの過学習確認
- true tension消失確認
- 境界過分割確認
- product listening確認

同じファイルを繰り返し調整に使わない。

---

# 3. データ分割と過学習防止

## 3.1 Partition

P5.15-00で固定する。

```text
Development
Validation
Holdout
Invariant Pairs
Runtime-only
Final Real-song Smoke
```

推奨:

### Development

- 基本Corpus 01, 02, 04, 05, 06
- 追加Corpus 13, 14, 16, 18, 19, 33, 34

### Validation

- 基本Corpus 07, 08, 09, 12
- 追加Corpus 15, 17, 20, 21, 22, 23, 24, 32, 35

### Holdout

- 既存Corpusから事前選定
- Phase 5 Accuracy Firstの未調整部分
- Round-trip vocabulary matrixの一部
- user real MIDIを含めない、または最後に1回だけ開く

### Invariant Pairs

```text
02 ↔ 03  duplicate invariance
26 ↔ 27  PPQ invariance
28 ↔ 29  velocity invariance
30 ↔ 31  track-order invariance
```

### Runtime-only

```text
36_long_three_minute_stability.mid
40-file batch
SURAN
Endless
```

## 3.2 Holdoutルール

- P5.15-00でhashを固定
- P5.15-06まで結果を見ない
- threshold変更後に再度見ない
- Holdout失敗時はProduct不採用またはStage単位rollback
- Holdoutを見て再調整する場合はPhase 5.15を終了し、新規Phaseとして扱う

---

# 4. 正解と比較方法

## 4.1 比較レベル

全caseを同じexact比較へ押し込まない。

```text
Exact Event Comparison
Canonical Identity Comparison
Probe Beat Comparison
Invariant Pair Deep Equal
Boundary-only Comparison
Representability-aware Comparison
```

## 4.2 Exact Event

使用対象:

- 開始拍・duration・ChordSymbolが一意
- vocabularyで表現可能
- merge許容が不要

## 4.3 Probe Beat

使用対象:

- 同一コード再アタック
- merge / splitの両方を許容
- 音楽的identityだけを見る

case 08では、イベント数よりprobe位置のcanonical identityを優先する。

## 4.4 Representability

次を区別する。

- detector vocabulary supported
- exporter supported
- parser supported
- canonical alias
- notation-only difference
- truly incorrect detection

`Cadd9`と`Csus2`のように3rd有無で区別可能なものは別identityとして扱う。

単なる表示aliasはaccuracy failureへ数えない。

## 4.5 Manifest validation

manifest自体も検証する。

- duplicate case ID
- missing MIDI
- invalid beat
- duration <= 0
- marker / expected event不整合
- pitch範囲
- PPQ表現不能
- slash bassと最低音不一致
- N.C.にnoteが存在
- comparison group欠損

manifestが不正ならAnalyzerを実行しない。

---

# 5. 指標

P5.15-00で式・分母・除外規則を固定する。

## Accuracy

- canonical exact
- usable
- root accuracy
- quality accuracy
- seventh accuracy
- tension accuracy
- slash bass accuracy
- boundary precision / recall / F1
- onset MAE / p95
- duration MAE / p95
- candidate recall
- rank 1
- Top-3 canonical
- Top-3 root
- duplicate output count
- manual input相当率

## Invariance

- exact duplicate invariance
- PPQ invariance
- velocity invariance
- track-order invariance
- tempo-map invariance
- deterministic hash

## Evidence

- exact duplicate note count
- event-local tension support
- adjacent-only tension count
- passing-tone classification
- shell core support
- root / 3rd / 7th support
- slash bass support
- boundary proposal provenance
- boundary rejection reason

## Runtime

- median
- p95
- max
- peak RSS
- batch total
- Live MIDI confirmed p50 / p90
- Chord Dojo benchmark
- Candidate Catalog size
- memory after repeated analysis

---

# 6. Feature Flags

候補:

```text
enableExactNoteEvidenceDedup
enableEventLocalTensionEvidence
enableSyncopatedShellBoundary
enableShellSeventhPreference
enableSuspendedQualityDisambiguation
```

ルール:

- 各Stageを個別にON/OFF
- Vault schema外
- local settingまたはAnalyzer profile
- Stage中は既定OFF
- P5.15-06で採用機能だけ接続
- master flagへまとめない
- rollback時に保存データへ影響しない

Stable / Accuracy First:

- Stableは既存挙動を基準
- Accuracy Firstへ通過機能を候補接続
- dedupが全Corpusで完全不変ならStable候補
- 最終既定値は結果で決定

---

# 7. P5.15-00 — Preflight / Data Audit / Baseline Freeze

## 成果物

```text
docs/phase5.15/00-repository-audit.md
docs/phase5.15/00-data-inventory.json
docs/phase5.15/00-partition-lock.json
docs/phase5.15/00-baseline-lock.json
docs/phase5.15/00-evaluation-contract.md
docs/phase5.15/00-current-failure-matrix.json
docs/phase5.15/00-roundtrip-baseline.json
docs/phase5.15/00-runtime-baseline.json
```

## 監査対象

- MIDI parser
- sustain処理
- note normalization
- duplicate note発生位置
- source / track / channel / voice identity
- role assignment
- boundary proposal
- segment construction
- pitch-class evidence
- candidate generation
- quality / tension score
- slash bass score
- Candidate Union
- Phase 5.14 Exporter
- round-trip harness
- feature flags
- benchmark harness

## 必須確認

- 基本12件読込
- 追加24件読込
- manifest validation PASS
- invariant group構築
- Phase 5.14 21/21再現
- 19 exact / 2 ambiguity再現
- 既存Corpus path確定
- Holdout hash固定
- tracked MIDI 0
- tracked `.local-evaluation` 0

P5.15-00ではAnalyzerを変更しない。

---

# 8. P5.15-01 — Exact Note Evidence Dedup

## 目的

完全一致のnote evidenceを解析上1件として扱う。

元MIDI、Piano Roll、保存dataは変更しない。

## Identity

最低限:

```text
source asset
logical voice
track
channel
pitch
effective onset
effective end
```

velocityをidentityへ含めるかは監査結果で決める。

別velocityのintentional layerを誤dedupしない。

## 除外

dedupしない:

- 別source
- 別logical voice
- 別track
- 別channel
- onset違い
- end違い
- re-articulation
- octave
- intentional unison

## Provenance

保持:

- representative ID
- duplicate count
- duplicate IDs
- dedup reason
- original note count
- effective note count

## Gate

- 02と03の結果deep equal
- score / rank / confidence一致
- 12 / 15 / 32の別voiceを消さない
- 既存全Corpus退行0
- deterministic
- memory改善または不変
- runtime重大悪化なし

---

# 9. P5.15-02 — Event-Local Tension Evidence

## 目的

11th / 13th / altered tensionの採用を現在event内の観測証拠へ限定する。

## Feature

tensionごとに記録:

```text
support duration
coverage ratio
first onset position
last offset position
stable / passing
adjacent-event-only
harmony / bass / melody role
velocity support
distinct source count
```

## 原則

- 次コードの音を前コードへ借りない
- bass roleを同じ重みのtension evidenceにしない
- melody weak/excludedをharmonyと同等にしない
- 一瞬のpassing toneだけでextensionを付けない
- 持続した本物のtensionは維持

## Threshold

必要なら:

1. 候補値を事前文書化
2. Developmentで比較
3. Validationで1回
4. freeze
5. Holdoutは最後

## Gate

False tension:

- 02の`Bm11 / Em11 / A13 / E13`を抑止
- 04で`Bm11 / E13 / A13`を抑止
- 05のbrief 11 / 13を昇格しない
- 18のmelody contaminationを抑止
- 19のbass approachをtension化しない

True tension:

- 06の`Bm11 / E13 / A13`を維持
- existing 7(b9) rescue維持
- #9 / #11 / b13 Corpus退行なし

---

# 10. P5.15-03 — Syncopated / Irregular Boundary Candidates

## 目的

pickup、0.5拍、1.5拍、triplet、common-tone legato、sustain overlapを正しく扱う。

## Boundary evidence

- bass onset
- root candidate change
- 3rd反転
- seventh変化
- shell core変化
- pitch-class distance
- note-on cluster
- note-off cluster
- silence
- pickup
- common toneを除いた変化
- re-articulation
- tempo-map independent beat position

## 方針

既存boundaryを置換しない。

```text
Existing proposals
+
Syncopated proposals
→ shadow scoring
→ Gate後に採用
```

## 反証

- melody-only onsetで分割しない
- chromatic approachだけで分割しない
- sustain common toneで境界を消さない
- same chord reattackで別qualityを作らない
- 4/4へ固定しない

## Gate

- 02 pickup / irregular回収
- 09 half-beat回収
- 17 common-tone境界回収
- 21 sustain overlap境界回収
- 22 triplet回収
- 23 3/4回収
- 24 6/8回収
- 25 tempo changeでbeat identity不変
- 35 N.C.を隣接コードへ吸収しない
- 過分割重大悪化なし
- boundary F1退行なし

---

# 11. P5.15-04 — Shell Seventh Preference

## 目的

root・3rd・7thが明確で、追加tension証拠が不足する場合、plain seventhを優先する。

## 適用条件

- root support
- 3rd明確
- seventh明確
- tension evidenceがGate未満
- slash bassが別途説明される
- vocabulary representable

## 対象

- dominant 7 shell
- minor 7 shell
- major 7 shell
- fifth omitted
- split harmony / bass

## 反証

壊さない:

- rootless dominant
- true tension
- true slash
- pedal bass
- arpeggiated shell
- add9 / sus
- omitted root voicing

## Gate

- 01 / 02 / 04 plain seventh優先
- 13 major7 shell
- 14 minor7 shell
- 15 rootless context維持
- 16 arpeggiation維持
- 20 pedal slash維持
- 06 true tension維持
- 07 true slash維持
- Top-3 recall低下なし
- provenance 100%

---

# 12. P5.15-05 — Suspended Quality Disambiguation

## 対象

```text
sus2 / add9
sus4 / 7sus4
```

## 判定

### sus2 / add9

```text
3rdなし + 2ndあり → sus2
3rdあり + 9thあり → add9
```

### sus4 / 7sus4

```text
3rdなし + 4thあり + seventhなし → sus4
3rdなし + 4thあり + seventhあり → 7sus4
```

## 注意

- 2ndと9thはpitch class同一でも、3rd有無が区別根拠
- inversionやoctave位置だけで判定しない
- vocabulary未対応なら追加しない
- notation aliasだけならcanonical equivalenceで扱う
- schema変更禁止

## Gate

- 33でsus2 / add9分類
- 34でsus4 / 7sus4分類
- Phase 5.14 2 ambiguityを再評価
- Round-trip 21/21維持
- add9 Corpus退行なし
- seventh detection退行なし

コード修正より評価側canonical equivalence修正が正しい場合は、その判断を採用する。

---

# 13. P5.15-06 — Combined Matrix / Holdout / Product Decision

## 組合せ

最低限:

```text
Baseline
Dedup only
Tension only
Boundary only
Shell only
Suspended only
Dedup + Tension
Boundary + Tension
Boundary + Shell
Dedup + Boundary + Tension
All accepted
```

## 比較表

各組合せで:

- canonical exact
- usable
- root
- quality
- tension
- slash
- boundary F1
- rank 1
- Top-3
- manual input
- runtime
- memory
- invariant failures
- holdout failures

## 採用ルール

Feature単位で採否を決める。

採用条件:

- Development改善
- Validation非退行
- Holdout重大退行なし
- invariant pair全PASS
- runtime Gate PASS
- provenance 100%
- rollback可能

禁止:

- 全Stageを自動的にON
- 合計scoreだけで採用
- 一部の重大退行を平均で隠す
- Product profileへ直接hard-code

## Stable / Accuracy First

候補:

- Stable: 現行維持
- Accuracy First: 採用feature ON
- dedup: 完全不変性確認後にStable候補

最終結果を報告してから既定値を固定する。

---

# 14. P5.15-07 — Full Regression / Runtime / Build

## Full test

- lint
- application TypeScript
- E2E TypeScript
- Vitest
- Rust
- Playwright
- all analyzer corpus
- 36 synthetic MIDI
- 21 round-trip events
- invariant pairs
- 40-file batch
- 3-minute MIDI
- Live MIDI benchmark
- Chord Dojo benchmark
- Web build
- Tauri build

## Runtime Gate

最低条件:

- 3分MIDI 10秒Gate維持
- 40-file batch重大悪化なし
- median / p95を報告
- peak RSS継続増加なし
- repeated analysisでmemory leakなし
- Candidate Catalog hard cap維持
- Live MIDI confirmed p50 / p90退行なし
- Chord Dojo退行なし

## Final real-song smoke

最大3件を1回だけ。

結果:

- previous
- new
- expected impression
- false tension
- missed tension
- over-segmentation
- under-segmentation
- manual correction必要性

ここで失敗した場合:

- Stage単位rollback
- thresholdをその場で再調整しない
- 次Phase候補として記録

---

# 15. Correction / Diagnostic Log

Vault schemaを変えず、評価出力へ次を追加可能。

- duplicate evidence removed
- tension rejected: adjacent-only
- tension rejected: brief passing
- shell preference applied
- boundary proposal source
- boundary rejected reason
- sus/add disambiguation reason
- feature flag state

禁止:

- personal file name
- absolute path
- raw MIDI bytes
- memo
- source title
- user identifier

---

# 16. Git・安全性

- `git add -A`禁止
- 明示pathだけstage
- force push禁止
- history rewrite禁止
- personal MIDI commit禁止
- test MIDI commit禁止
- `.local-evaluation`追跡禁止
- build artifacts commit禁止
- generated reportへ個人情報を入れない
- tracked MIDI 0を最終Gate
- worktree cleanを最終Gate

合成fixtureをCIへ入れる場合:

```text
manifest / generator sourceだけ追跡
→ test時にMIDI生成
→ test後削除
```

バイナリMIDIを追跡する方針へ変更しない。

---

# 17. PR構成

```text
docs/p515-00-preflight-baseline
fix/p515-01-exact-evidence-dedup
fix/p515-02-event-local-tension
feature/p515-03-syncopated-boundary
fix/p515-04-shell-seventh-preference
fix/p515-05-suspended-quality
test/p515-06-combined-holdout
test/p515-07-full-release-gates
```

要件:

- stacked PR
- 各Stageは前Stageをbase
- 既存PRを書き換えない
- mainへ未マージ
- Phase 5.2未着手
- failure時は該当Stageだけ停止・rollback可能

---

# 18. 成果物

```text
docs/phase5.15/00-repository-audit.md
docs/phase5.15/00-data-inventory.json
docs/phase5.15/00-partition-lock.json
docs/phase5.15/00-baseline-lock.json
docs/phase5.15/00-evaluation-contract.md
docs/phase5.15/00-current-failure-matrix.json
docs/phase5.15/00-roundtrip-baseline.json
docs/phase5.15/00-runtime-baseline.json

docs/phase5.15/01-evidence-dedup-report.md
docs/phase5.15/02-tension-evidence-report.md
docs/phase5.15/03-boundary-report.md
docs/phase5.15/04-shell-preference-report.md
docs/phase5.15/05-suspended-disambiguation-report.md
docs/phase5.15/06-combined-matrix.md
docs/phase5.15/06-holdout-report.md
docs/phase5.15/07-runtime-memory.md
docs/phase5.15/07-product-smoke.md
docs/phase5.15/08-privacy-schema-audit.md
docs/phase5.15/09-final-report.md
```

---

# 19. 受け入れ条件

## Data / Baseline

1. 基本12件読込
2. 追加24件読込
3. manifest validation PASS
4. Phase 5.14 Round-trip 21/21再現
5. 19 exact / 2 ambiguity再現
6. Development / Validation / Holdout固定
7. invariant pair固定
8. runtime baseline固定

## Dedup

9. 02 / 03 deep equal
10. score / rank / confidence一致
11. 別voice unison維持
12. provenance維持
13. existing Corpus退行0

## Tension

14. 02 false tension抑止
15. 04 false tension抑止
16. 05 brief tension抑止
17. 18 melody contamination抑止
18. 19 bass approach誤認抑止
19. 06 true tension維持
20. existing altered tension維持

## Boundary

21. pickup回収
22. 0.5拍回収
23. 1.5拍回収
24. triplet回収
25. 3/4回収
26. 6/8回収
27. common-tone境界回収
28. sustain境界回収
29. N.C.維持
30. over-segmentation重大悪化なし

## Shell / Slash / Rootless

31. dominant shell改善
32. minor7 shell改善
33. major7 shell改善
34. rootless維持
35. arpeggiation維持
36. true slash維持
37. pedal bass維持
38. true tension維持

## Suspended

39. sus2 / add9分類
40. sus4 / 7sus4分類
41. notation-only差をaccuracy failureにしない
42. Round-trip 21/21維持

## Invariance

43. duplicate invariance PASS
44. PPQ invariance PASS
45. velocity invariance PASS
46. track-order invariance PASS
47. tempo-map identity PASS
48. deterministic PASS

## Product Regression

49. rank 1重大退行なし
50. Top-3 canonical重大退行なし
51. Top-3 root重大退行なし
52. manual input重大悪化なし
53. runtime Gate PASS
54. memory Gate PASS
55. Live MIDI latency維持
56. Chord Dojo維持
57. Phase 5.14 Exporter不変
58. Progression Detail UI不変
59. Vault schema不変
60. `fileVersion = 1`
61. `defaultAnalyzerMode = phase4-v1`

## Build / Safety

62. lint PASS
63. application typecheck PASS
64. E2E typecheck PASS
65. Vitest PASS
66. Rust PASS
67. Playwright PASS
68. Web build PASS
69. Tauri build PASS
70. tracked MIDI 0
71. tracked `.local-evaluation` 0
72. worktree clean
73. mainへ未マージ
74. Phase 5.2未着手

---

# 20. やらないこと

- Analyzer全面書換え
- ML / AI detector導入
- 新しい大規模コード語彙
- UI追加
- Vault schema変更
- MIDI Exporter voicing調整
- Round-trip専用の不自然なMIDI生成
- 特定file名による分岐
- 特定BPM / offset hard-code
- Holdoutを見ながら調整
- 実曲smokeを調整用Corpusにする
- Hybrid再採用
- Phase 5.2
- Bass Practice Mode

---

# 21. 停止条件

- Phase 5.14 baselineを再現できない
- manifestまたはfixtureに矛盾
- 02 / 03差がdedup以外に起因
- true / false tensionを分離不能
- boundary改善が既存Corpusを大幅退行
- shell preferenceがrootlessを破壊
- slash / pedalを破壊
- sus差がnotation-onlyでコード変更が不適切
- PPQ / velocity / track-order不変性を満たせない
- Product接続にschema変更が必要
- Live MIDI latency退行
- Chord Dojo退行
- runtime Gate超過
- personal MIDI commitが必要
- Holdoutを見て再調整する必要
- test期待値を根拠なく変更する必要

停止時は:

1. failure case
2. 根本原因
3. 影響
4. 採用可能Stage
5. 不採用Stage
6. rollback
7. 次Phase候補
8. ユーザー確認が必要な場合は1点だけ

を報告する。

---

# 22. 最終報告

1. Phase 5.14 merge / base
2. FL Studio smoke
3. PR / branch / commit
4. data inventory
5. partition / holdout
6. baseline failure matrix
7. dedup結果
8. tension結果
9. boundary結果
10. shell結果
11. suspended結果
12. invariant pair結果
13. combined matrix
14. adopted features
15. rejected features
16. Stable / Accuracy First設定
17. Corpus別accuracy
18. rank 1 / Top-3
19. manual input
20. Round-trip
21. runtime / memory
22. Live MIDI / Chord Dojo回帰
23. real-song smoke
24. schema / `fileVersion`
25. test件数
26. Web / Tauri build
27. EXE / MSI / NSIS / SHA-256
28. privacy / tracked MIDI
29. feature flags / rollback
30. 未完了・既知制約
31. main未マージ
32. Phase 5.2未着手

---

# 23. Codex実行方針

- P5.15-00から順番どおり実行
- 初期12件と追加24件を最初に全確認
- 既存Corpusを同時にbaseline化
- Phase 5.14 Exporterを診断基盤として利用
- 1Stageずつ独立実装
- 先に評価してからProduct接続
- HoldoutはP5.15-06まで開かない
- 人間QAはFL smoke 1回＋最終実曲3件以内
- 正常時は途中確認を求めない
- Gate失敗時だけ停止
- mainへマージしない
- Phase 5.2へ進まない
