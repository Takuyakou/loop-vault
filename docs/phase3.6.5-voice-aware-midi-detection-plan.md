# Loop Vault Phase 3.6.5 Codex作業指示書
## Voice-Aware MIDI Chord Detection — 全部入りMIDIでも正解候補へ短時間で到達する

---

## 0. 結論

Phase 3.6.5では、SMF Type 0や複数楽器混在MIDIに対するコード検出を改善する。

目的は「一発で完全な正解を出す」ことではない。

次の三段構えを完成させる。

```text
Stage A
入力MIDIをVoice単位へ正しく分解する

Stage B
正解候補をTop-Kへ残し、人間の修正コストを下げる

Stage C
必要な場合だけ、解析に使うVoiceをユーザーが素早く調整する
```

Phase 3.6.5のテーマ:

**「汚れた全部入りMIDIでも、正解候補を見失わず、数秒で修正できる解析基盤へ」**

---

# 1. 前提

本Phaseは以下が完了していることを前提とする。

- Phase 3.6
  - hybrid-v1
  - weighted profile
  - track role
  - adaptive segmentation
  - Top-K
  - 2-pass DP
  - confidence
- Phase 3.6.1
  - legacy-boundary-rerank
  - failure analysis
  - ablation
- Phase 3.6.2
  - Gold / Silver / Bronze
  - real MIDI evaluation flywheel
- Phase 3.6.3
  - Progression Editing Workspace
  - original / current
  - alternatives
  - correction log
- Phase 3.6.4
  - UI reliability
  - PlaybackController
  - Undo
  - Save CTA
  - Song minimap

既定解析器は引き続き`legacy`。

Phase 3.6.5で新方式を既定へ切り替えない。

---

# 2. 現状診断

実MIDI `all_instruments.mid` 相当では、以下が主な故障原因となる。

## F1. Type 0で全楽器が1トラック

従来のトラック単位の役割推定が機能しない。

複数channelに分かれていても、同一trackとしてmixed扱いになる。

## F2. ドラムがroot証拠を汚染

GM percussion channelのキックが、

- 低音域
- 小節頭
- 強拍

としてroot判定へ強く寄与する。

## F3. 同一channel内で役割が混在

ピアノchannelに、

- 左手ベース
- コード
- 高域メロディ

が同居する。

## F4. ウワモノがquality / tensionを汚染

Lead、Piccolo、Choir、Strings等が非和声音を追加する。

## F5. 評価セットがきれいすぎる

Chord Drip syntheticは主にクリーンなType 1であり、Type 0、多channel混在、drum重畳、program欠損を十分再現しない。

---

# 3. Phase 3.6.5の設計原則

## 3.1 基本単位はVoice

解析単位をtrackから次へ変更する。

```text
Voice = trackIndex × channel
```

Type 0 / Type 1を同じ構造で扱う。

## 3.2 percussionはノート単位で除外

channel 10（0-based channel 9）は、track名やrole推定より先にpercussion扱いする。

```text
channel == 9
→ chord detection evidenceから除外
```

ただし、MIDI Thruや元MIDI表示では保持してよい。

## 3.3 GM programを絶対視しない

役割推定は固定順位ではなく、複数証拠を合成する。

強い順の目安:

```text
channel 10 percussion hard rule
↓
ファイル内に明示されたProgram Change
↓
明確なTrack Name
↓
音域・polyphony・density等の実測特徴
↓
mixed
```

重要:

- パーサのデフォルトProgram 0と、実ファイルのProgram Changeを区別する
- Program 0だから自動的にpiano / harmonyと断定しない
- 複数Program Changeがある場合、最後の値だけをVoice全体へ適用しない

## 3.4 ProgramはNote On時点へ紐付ける

```ts
export interface TimedNote {
  // existing fields...
  trackIndex: number;
  channel: number;
  program?: number;
  programExplicit: boolean;
}
```

各Note On時点で有効なProgram Changeを記録する。

Voice代表Programは、音価合計またはnote countで集約する。

## 3.5 Voice内を物理的に分割しない

低音ノートを別Voiceへ移さない。

同じノートから複数の証拠profileを作る。

```ts
export interface VoiceEvidenceProfiles {
  rootEvidence: number[];
  bassEvidence: number[];
  qualityEvidence: number[];
  tensionEvidence: number[];
}
```

例:

```text
C2
root / bass証拠には強い
quality証拠には弱い
tension証拠にはほぼ使わない
```

## 3.6 候補は多様性を持たせる

同一rootのquality違いだけでTop-Kを埋めない。

ただし、異なるrootだけを強制しない。

UI候補は次の多様性を持つ。

- pure top score
- alternative root
- same root / different quality
- bass hypothesis
- equivalent pitch-set hypothesis

## 3.7 人間による修正を前提とする

自動解析器の目標は、

```text
Top-1完全正解
```

だけではない。

主な製品指標:

- Root@1 / Root@3
- Quality@1 / Quality@3
- Exact@1 / Exact@3
- correction cost
- manual input rate
- candidate chip selection rate
- time to corrected progression

## 3.8 新Analyzer modeとして並存

```ts
export type MidiAnalyzerMode =
  | "legacy"
  | "legacy-boundary-rerank"
  | "voice-aware-rerank-v1"
  | "hybrid-v1";
```

`defaultAnalyzerMode`は変更しない。

---

# 4. データ構造

## 4.1 VoiceRole

```ts
export type VoiceRole =
  | "bass"
  | "harmony"
  | "pad"
  | "melody"
  | "percussion"
  | "mixed";
```

## 4.2 Voice

```ts
export interface Voice {
  id: string; // `${trackIndex}:${channel}`
  trackIndex: number;
  channel: number;

  trackName?: string;

  explicitPrograms: {
    program: number;
    noteCount: number;
    durationTicks: number;
  }[];

  dominantProgram?: number;
  dominantProgramExplicit: boolean;

  noteCount: number;
  pitchRange: [number, number];
  medianPitch: number;
  avgDurationTick: number;
  noteDensity: number;
  maxPolyphony: number;
  simultaneousOnsetRatio: number;
  lowestVoiceShare: number;
  highestVoiceShare: number;

  inferredRole: VoiceRole;
  roleConfidence: number;
  roleEvidence: VoiceRoleEvidence;
}
```

## 4.3 VoiceRoleEvidence

```ts
export interface VoiceRoleEvidence {
  channelRule?: {
    role: VoiceRole;
    confidence: number;
  };

  program?: {
    role: VoiceRole;
    confidence: number;
    explicit: boolean;
  };

  trackName?: {
    role: VoiceRole;
    confidence: number;
  };

  measured: Record<VoiceRole, number>;
}
```

## 4.4 AnalysisInput

セッション一時状態。

```ts
export interface AnalysisInput {
  voices: Voice[];
  enabledVoiceIds: string[];
  roleOverrides: Record<string, VoiceRole>;
}
```

`data.json`へ保存しない。

## 4.5 VoiceSelectionPreset

```ts
export type VoiceSelectionPreset =
  | "auto"
  | "harmony-and-bass"
  | "exclude-melody"
  | "all";
```

---

# 5. GM role evidence

新設候補:

```text
src/domain/midi/gmRoles.ts
```

## 5.1 基本対応

目安:

```text
0–15    Keys                harmony
16–23   Organ               harmony
24–31   Guitar              harmony
32–39   Bass                bass
40–47   Solo Strings        melody
48–55   Ensemble / Choir    pad
56–79   Brass / Reed / Pipe melody
80–87   Synth Lead          melody
88–95   Synth Pad           pad
96–103  FX                  pad
104–111 Ethnic              harmony / mixed
112–119 Percussive          percussion
120–127 SFX                 mixed
channel 9                   percussion
```

## 5.2 confidence

GM Programが明示されている場合でもconfidenceを1.0に固定しない。

例:

```text
Bass programs       0.95
Synth Lead          0.90
Pad                 0.88
Piano               0.65
Guitar              0.70
Ethnic              0.55
SFX                 0.30
```

PianoやGuitarはbass / harmony / melodyが混在しやすいため低め。

## 5.3 default program

Program Changeがファイル内に存在しない場合:

```text
program = 0
programExplicit = false
```

として扱い、GM evidenceへ強く使わない。

---

# 6. Stage A1 — Parser / Voice model

## 6.1 目的

Type 0 / Type 1を同じVoice構造へ変換する。

## 6.2 実装

- TimedNoteのchannel保持確認
- Note On時点のprogram付与
- programExplicit
- Voice集計
- percussion hard exclusion
- Voice feature計算
- tests

## 6.3 percussion

次をchord evidenceへ入れない。

```text
channel == 9
```

Track単位のdrum判定に依存しない。

GM percussion系Programもpercussion evidenceとするが、channel 9 hard ruleを最優先。

## 6.4 受け入れ条件

- Type 0でchannel別Voiceが生成される
- Type 1でも同じAPI
- channel 9は必ずpercussion
- Program Changeの時系列がNoteへ付く
- Program未指定をProgram 0明示と混同しない
- 同じ入力から同じVoice一覧

---

# 7. Stage A2 — Role evidence / profiles

## 7.1 measured features

最低限:

- median pitch
- pitch range
- note density
- avg duration
- max polyphony
- simultaneous onset ratio
- lowest voice share
- highest voice share
- stepwise motion ratio
- repeated pitch-class ratio
- sustain ratio

## 7.2 role inference

hard precedenceではなく、weighted evidence合成。

```ts
export function inferVoiceRole(
  voice: VoiceFeatureInput,
): VoiceRoleInference
```

```ts
export interface VoiceRoleInference {
  role: VoiceRole;
  confidence: number;
  scores: Record<VoiceRole, number>;
  reasons: string[];
}
```

## 7.3 root / quality / tension evidence

既存profile生成をVoice-aware化する。

```ts
export interface VoiceContributionWeights {
  root: number;
  bass: number;
  quality: number;
  tension: number;
}
```

例:

### bass

```text
root    strong
bass    strongest
quality weak
tension none
```

### harmony

```text
root    medium
bass    medium
quality strong
tension medium
```

### pad

```text
root    medium
bass    weak
quality 0.8
tension medium
```

### melody

```text
root    weak
bass    none
quality weak
tension weak-to-medium
```

### percussion

```text
all zero
```

## 7.4 role overrides

ユーザーoverrideはrole inference後に適用する。

ただしStage C UIまでは内部APIだけ用意してよい。

---

# 8. Stage A3 — 汚しコーパス

## 8.1 CLI

```bash
npm run eval:degrade
```

## 8.2 入力

Chord Drip clean corpus。

正解manifestは維持する。

## 8.3 degradation

最低限:

1. Type 0 merge
2. GM drums overlay
3. lead melody overlay
4. track name removal
5. program change removal
6. all program 0
7. sustain extension
8. timing jitter
9. piano left-hand bass overlay
10. same-channel melody overlay
11. combined degradation

## 8.4 deterministic

seed固定。

同じ入力 / seedからbyte-identical output。

## 8.5 split

clean / degradedを混ぜずに別レポート。

```text
clean
type0
drums
melody
metadata-missing
sustain
jitter
combined
```

## 8.6 受け入れ条件

以下を記録する。

- Root@1 / Root@3
- Quality@1 / Quality@3
- Exact@1 / Exact@3
- correction cost
- runtime
- cleanとの差
- legacyとの差

単に「cleanとの差5pt以内」だけで合格にしない。

---

# 9. Stage A4 — Voice-aware reranker

## 9.1 mode

```text
voice-aware-rerank-v1
```

## 9.2 境界

初期実装はlegacy境界固定。

理由:

- 境界問題とVoice問題を分離
- 計算量を抑える
- Phase 3.6.1の成功構成を維持

## 9.3 処理

```text
legacy timeline
↓
Voice-aware weighted profiles
↓
Top-K candidates
↓
legacy候補を必ず残す
↓
保守的rerank
```

## 9.4 clean regression guard

- clean Root@1 >= legacy
- clean Quality@1 >= legacy
- clean Boundary = legacy
- correction cost悪化なし

## 9.5 dirty improvement

カテゴリ別に改善を見る。

特に:

- type0
- drums
- same-channel mixed
- melody overlay
- metadata missing

---

# 10. Stage B1 — Candidate diversity

## 10.1 内部Top-K

内部Top-8を保持。

## 10.2 UI候補選択

最大5件。

順序例:

1. global top score
2. best different root
3. best same root / different quality
4. best bass-root hypothesis
5. best equivalent pitch-set hypothesis

重複は繰り上げ。

## 10.3 diversity function

```ts
export function selectDiverseAlternatives(
  candidates: readonly ChordCandidateScore[],
  options: CandidateDiversityOptions,
): ChordCandidateScore[]
```

## 10.4 指標

- Root@1 / Root@3
- Quality@1 / Quality@3
- Exact@1 / Exact@3
- candidate coverage
- duplicate-root ratio
- manual input rate

## 10.5 受け入れ

候補多様性は次で評価する。

```text
Root@3 - Root@1
Quality@3 - Quality@1
Exact@3 - Exact@1
```

異なる階層の指標を直接比較しない。

---

# 11. Stage B2 — Correction cost

## 11.1 定義

```text
Top-1が正解                     0
候補chipを1回選択               1
Root/Quality/Bass編集で到達      2
コード名手入力                  3
正解候補が生成不能              4
```

複数操作が必要な場合は最小コスト。

## 11.2 レポート

- mean
- median
- P90
- category別
- clean / dirty別
- legacy / reranker / voice-aware別

## 11.3 UI連携

Phase 3.6.3の編集ログから、

- alternative選択
- structure editor
- manual input

を区別できるようにする。

既存feedback schemaを破壊しない。

---

# 12. Stage B3 — 修正伝播

## 12.1 目的

同じ誤検出が複数区間にある場合、1回の修正を他区間へ提案する。

## 12.2 自動適用しない

必ず候補一覧を出し、ユーザーが選択する。

## 12.3 similarity features

PCPだけにしない。

最低限:

- weighted PCP similarity
- bass profile
- original root
- chord family
- segment duration
- metric position
- key context
- previous / next chord
- enabled Voice set
- role profile

## 12.4 API

```ts
export interface SimilarSegmentCandidate {
  segmentId: string;
  similarity: number;
  reasons: string[];
}
```

```ts
export function findSimilarSegments(
  timeline: readonly EditableChordSlot[],
  editedSegment: EditableChordSlot,
  context: SimilarityContext,
): SimilarSegmentCandidate[]
```

純関数。

## 12.5 UI

```text
同じ修正を適用できそうな区間が3件あります

[x] 9小節目
[x] 17小節目
[ ] 25小節目

[試聴]
[選択した区間へ適用]
```

一括適用は1つのUndo operation。

## 12.6 feedback

記録:

- propagation shown
- accepted segment ids
- rejected segment ids
- threshold
- analyzer version

将来のpersonal reranker用。

## 12.7 誤爆テスト

- C6 vs Am7/C
- Cmaj7 vs Em/C
- same PCP / different bass
- same chord / different context
- same root / different quality

---

# 13. Stage C — 解析ミキサー（条件付き）

## 13.1 実装判断ゲート

Stage A / B完了後、以下を確認する。

解析ミキサーを実装する条件:

- 実MIDIで自動Role判定の誤りが頻発
- Voice選択で候補品質が明確に改善
- 修正コストが手動Voice選択で減る
- ユーザーが楽器を選んで解析したい用途を持つ

条件を満たさない場合、Stage CはPhase 3.6.5.1へ延期可能。

延期理由と測定結果を報告する。

## 13.2 collapsed summary

通常時:

```text
解析に使用中 7 / 11 Voice
ドラム 1件を除外
[解析ミキサーを開く]
```

## 13.3 expanded mixer

各Voice strip:

- icon
- GM name / track name
- channel
- note count
- pitch range
- role
- confidence
- Mute
- Solo
- role override

## 13.4 quick presets

- 自動
- 和声＋ベース
- メロディを除外
- すべて

## 13.5 role override

```text
Bass
Harmony
Pad
Melody
Mixed
Exclude
```

percussion hard ruleはoverride不可、または明示警告付き。

## 13.6 non-persistent

AnalysisInputはセッション一時状態。

`data.json`へ保存しない。

## 13.7 immediate re-analysis

- debounce 200ms
- request sequence
- latest only
- stale result discard
- analyzing indicator
- dirty guard
- reanalysis後は編集state破棄
- main thread長時間block回避

型例:

```ts
export interface AnalysisRequest {
  sequence: number;
  input: AnalysisInput;
}
```

## 13.8 performance

目標:

```text
all_instruments.mid相当で1秒以内
```

ただしUI freezeは別途禁止。

必要ならWeb WorkerまたはTauri commandを検討する。

## 13.9 developer detail

任意:

```text
Aadd9/C# の証拠

Bass      root C# +0.42
Piano     quality A6 +0.31
Lead      foreign -0.12
Drums     excluded
```

通常ユーザーへ常時表示しない。

---

# 14. UI / UX

## 14.1 解析結果上部

```text
[ファイル概要]
[全曲ミニマップ]
[解析Voice summary]
[Candidate Blocks]
```

## 14.2 mixerを常時展開しない

コード採集画面の情報量を増やしすぎない。

## 14.3 editingとの連携

Voice変更時に未保存編集がある場合:

```text
解析条件を変えると、現在の編集内容は破棄されます

[キャンセル]
[破棄して再解析]
```

既存Modalを利用。

## 14.4 correction propagation

Phase 3.6.3 Inspector内に追加。

通常はcollapsed。

---

# 15. 評価基盤

## 15.1 datasets

分離:

- clean synthetic
- dirty synthetic
- real MIDI Gold
- real MIDI Silver
- real MIDI Bronze
- unlabeled real MIDI

## 15.2 analyzer compare

```text
legacy
legacy-boundary-rerank
voice-aware-rerank-v1
hybrid-v1
```

## 15.3 hard guards

Clean:

- Root@1退行なし
- Quality@1退行なし
- Boundary同等
- Correction cost悪化なし

Dirty:

- root / quality / exact / top-k改善
- correction cost低下
- drumsカテゴリ改善
- type0カテゴリ改善

Real Gold:

- 退行なし

Silver / Bronze:

- disagreement傾向
- review需要
- hard guardには使わない

## 15.4 default mode

既定切替条件:

- clean退行なし
- dirty改善
- Gold real MIDI退行なし
- correction cost低下
- 決定性
- 3分MIDIでUI停止なし
- manual QA良好

条件達成前は`legacy`維持。

---

# 16. パフォーマンス

## 16.1 profile

計測対象:

- parser
- Voice build
- role inference
- profile build
- candidate scoring
- diversity selection
- rerank
- reanalysis total

## 16.2 prefix-sum

既存のprefix-sum feature tableを再利用。

Voice別profileを再計算する場合も、可能ならVoice単位prefix tableを用意する。

## 16.3 解析ミキサー

enabled Voice set変更時に全MIDIを再parseしない。

次をキャッシュする。

- TimedNote
- Voice
- per-Voice cumulative profiles
- metadata

---

# 17. Stage構成

## Stage 0 — Audit

- all_instruments.mid診断再現
- parser
- channel
- Program Change
- track role
- evaluation corpus
- Phase 3.6.1 reranker
- Phase 3.6.3 editor
- Phase 3.6.4 UI

成果物:

```text
docs/phase3.6.5-audit.md
```

## Stage A1 — Voice model

- TimedNote program
- explicitProgram
- Voice
- percussion hard rule
- tests

## Stage A2 — Role evidence / profiles

- GM evidence
- measured evidence
- profile分離
- role override API
- tests

## Stage A3 — Dirty corpus

- eval:degrade
- degradation categories
- deterministic output
- baseline report

## Stage A4 — Voice-aware reranker

- new mode
- legacy boundaries
- scoring
- clean / dirty compare
- regression guards

## Stage B1 — Candidate diversity

- diverse alternatives
- Root/Quality/Exact @1/@3
- candidate coverage

## Stage B2 — Correction cost

- operation cost
- report
- feedback integration

## Stage B3 — Propagation

- multi-feature similarity
- UI proposal
- batch Undo
- feedback

## Stage C — Analysis Mixer

- conditional gate
- collapsed summary
- Voice strips
- presets
- role override
- sequence/cancel
- caching
- dirty guard

## Final — QA

- clean
- dirty
- real
- performance
- UI
- lint
- tests
- build
- tauri build
- installer
- final report

---

# 18. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.6.5を実装します。

仕様の正は
docs/phase3.6.5-voice-aware-midi-detection-plan.md
です。

目的:
SMF Type 0や複数楽器入りMIDIをVoice単位へ分解し、
正解候補をTop-Kへ残し、人間の修正コストを下げる。

絶対に守ること:

1. Phase番号は3.6.5。3.7 Live MIDIを実装しない。
2. defaultAnalyzerModeを変更しない。
3. 新方式はvoice-aware-rerank-v1として並存させる。
4. 解析単位はtrack×channelのVoice。
5. channel 9 percussionはノート単位でhard除外する。
6. Program未指定のdefault 0と明示Program 0を区別する。
7. 最後のProgram ChangeだけをVoice全体へ適用しない。
8. 各Note On時点のProgramを保持する。
9. GM programを絶対的に最優先しない。
10. role evidenceはchannel / explicit program / track name / measuredを合成する。
11. Voice内ノートを低音・高音で物理分割しない。
12. root / bass / quality / tension evidenceを分離する。
13. alternativesは多様化するが、異なるrootだけを強制しない。
14. Root@1/@3、Quality@1/@3、Exact@1/@3を同じ粒度で比較する。
15. correction costの定義を固定する。
16. propagationはPCPだけで判定しない。
17. propagationを自動適用しない。
18. AnalysisInputはセッション一時状態。data.jsonへ保存しない。
19. mixerの再解析はsequence管理し、古い結果を破棄する。
20. mixerはStage A/Bの結果を見て条件付き実装する。
21. clean corpusを退行させない。
22. dirty corpusをカテゴリ別評価する。
23. Gold/Silver/Bronzeを混ぜない。
24. 解析は純関数・決定的。
25. src/domainからReact/Tauri/Zustandをimportしない。
26. repositoryへ直接書かない。
27. fileVersionを上げない。
28. 各Stageでlint、test、build、評価数値を報告する。
29. 影響範囲の大きい変更を同一コミットへ混ぜない。

作業開始前:
- 関連ファイル
- 現行Voice/track構造
- Program Change処理
- role inference
- scoring
- evaluation datasets
- UI統合点
- 変更計画
- リスク
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- clean / dirty / real評価
- correction cost
- performance
- テスト結果
- 手動確認項目
- 未解決事項
- 次Stageへの申し送り
を報告する。

コミット:
P3.6.5-XX: 要約
```

---

# 19. テスト

## Parser / Voice

- Type 0
- Type 1
- channel separation
- channel 9
- explicit Program 0
- no Program
- multiple Program Changes
- Note On時点Program
- deterministic Voice ids

## Role

- bass program
- lead program
- pad program
- piano mixed
- track name conflict
- measured override
- low confidence mixed
- percussion

## Profiles

- bass evidence
- quality evidence
- tension evidence
- melody suppression
- pad contribution
- same-channel left hand

## Dirty corpus

- type0
- drums
- melody
- metadata removal
- sustain
- jitter
- combined
- deterministic bytes

## Candidate diversity

- same root quality
- different root
- bass hypothesis
- equivalent pitch set
- duplicate removal
- Root/Quality/Exact @1/@3

## Propagation

- same chord repeated
- same PCP different bass
- C6 vs Am7/C
- Cmaj7 vs Em/C
- context difference
- batch Undo
- feedback

## Mixer

- mute
- solo
- role override
- presets
- stale sequence discard
- debounce
- dirty guard
- non-persistence
- cache reuse

## Regression

- legacy
- reranker
- hybrid
- Capture
- editor
- save
- correction log
- real evaluation
- UI reliability

---

# 20. 人間側確認

## Stage A

all_instruments.mid相当で確認:

- Voice一覧
- channel
- GM名
- Program explicit
- role
- drums除外
- Piano / Bass / Lead / Padの分類
- 小節頭キック由来の誤rootが減るか

## Stage B

- 正解候補がTop-3に入るか
- 同じroot候補だけで埋まらないか
- manual input率
- correction cost
- 1箇所修正後の伝播候補
- 誤爆

## Stage C

- `和声＋ベース`
- `メロディを除外`
- Voice solo
- role override
- 1秒以内
- 古い解析結果で上書きされない
- 編集中確認
- 画面がごちゃつかない

## 最終

- clean corpus
- dirty corpus
- 実MIDI
- 3分MIDI
- all_instruments.mid
- 修正コスト
- 解析時間
- installer

---

# 21. 受け入れ条件

## Stage A

- Type 0をVoice分解できる
- channel 9がrootへ寄与しない
- Program未指定とProgram 0を区別
- NoteごとのProgram
- clean退行なし
- dirtyカテゴリ改善

## Stage B

- Root@3 > Root@1
- Quality@3 > Quality@1
- Exact@3 > Exact@1
- candidate diversity改善
- correction cost低下
- propagation誤爆テスト
- 自動適用なし
- Undo可能

## Stage C

- 条件付き実装判断が文書化
- collapsed summary
- presets
- Mute / Solo
- role override
- sequence管理
- stale result破棄
- 非永続
- 1秒以内目標
- UI freezeなし

## 全体

- defaultAnalyzerModeはlegacy
- voice-aware-rerank-v1並存
- deterministic
- fileVersion 1
- clean / dirty / real分離
- lint
- test
- build
- tauri build
- installer
- final report

---

# 22. バックログ

Phase 3.6.5では行わない。

- channel内Program区間ごとのUI表示
- 自動key modulation追跡
- learned role classifier
- learned reranker
- Rust移行
- ONNX
- 自動修正伝播
- mixer設定永続化
- multi-pass Voice separation
- source separation
- audio chord detection

---

# 23. 最終メッセージ

Phase 3.6.5の目的は、解析器を複雑にすることではない。

```text
トラック単位では見えなかった楽器をVoiceへ分ける
↓
ドラム・メロディ・ベースの証拠を正しく扱う
↓
正解候補をTop-Kへ残す
↓
人間が候補を選んで素早く直す
↓
同じ修正を安全に伝播する
```

**全部入りMIDIでも、正解候補へ短時間で到達できる。**

これをPhase 3.6.5の完成形とする。
