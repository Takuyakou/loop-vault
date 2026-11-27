# Loop Vault Phase 3.7.1.2 Codex追加作業指示書
## Chord Drip Smooth / Style Candidate Integration
### Quick Chord Editorの5候補へ「スムーズ」「スタイル」を統合する

---

## 0. 結論

Phase 3.7.1.2では、Loop VaultのQuick Chord Editorが表示する最大5件の候補へ、Chord Drip Guided Repairの次の2戦略を統合する。

- `smoothConnection` — スムーズ
- `authorReferenceFit` — スタイル

ただし、MIDI解析器が提示する「元の演奏を推定する候補」と、Chord Drip由来の「より良い進行へ直す提案」は意味が異なる。

そのため、5件を無名の同列候補として混ぜず、次の構成で表示する。

```text
検出候補
1. Analyzer候補A
2. Analyzer候補B
3. Analyzer候補C

修正提案
4. スムーズ候補
5. スタイル候補
```

候補不足・重複時は有効候補のみ表示し、空の候補や偽のスタイル候補を生成しない。

Phase 3.7.1.2のテーマ:

**「元のコードを推定する候補に加え、前後へ自然につなぐ候補と、作者の好みに近い候補を同じQuick Editorから選べるようにする」**

---

# 1. 背景

Phase 3.7.1.1では、Quick Chord Editorの代替候補を最大5件へ拡張した。

現在の候補は主にMIDI解析器・コード候補生成器から供給され、次の目的を持つ。

```text
このMIDIで本来鳴っていた可能性があるコードを提示する
```

一方、Chord Drip Guided Repairの候補は次の目的を持つ。

```text
現在のコードを、進行文脈に合う別のコードへ修正する
```

両者は同じ候補リストへ表示できるが、意味をUI上で区別しなければならない。

---

# 2. Chord Dripから統合する戦略

## 2.1 スムーズ

内部ID:

```ts
smoothConnection
```

目的:

- 前後コードとの共通音を増やす
- Bassの移動を自然にする
- Top Voiceの移動を小さくする
- Guide Toneの接続を良くする
- 低域の濁りを避ける

UI表示:

```text
スムーズ
```

説明:

```text
前後を自然につなぐ候補
```

## 2.2 スタイル

内部ID:

```ts
authorReferenceFit
```

目的:

- ユーザーが確認済みにした進行
- 過去に手動修正して採用したコード
- Gold相当の正例
- お気に入り・採用済み進行内の接続
- Chord Drip由来の明示的な正例

に近い候補を提示する。

UI表示:

```text
スタイル
```

説明:

```text
あなたの過去の好みに近い候補
```

重要:

- 元コードへ戻す機能ではない
- ジャンルプリセット名ではない
- データ不足時に推測で表示しない
- 凍結済みJudgeや未検証の自動学習器を使わない

---

# 3. 候補5件の割り当て

## 3.1 基本構成

```text
Slot 1: Analyzer最有力代替
Slot 2: Analyzerの異Root候補
Slot 3: Analyzerの異Quality / Bass候補
Slot 4: smoothConnection
Slot 5: authorReferenceFit
```

UIではSlot番号だけでなく、候補の由来を表示する。

例:

```text
1  検出       A6/9
2  検出       A13
3  検出       F#m7/A
4  スムーズ   C#m7
5  スタイル   Fmaj9/A
```

## 3.2 欠落時

### スムーズ候補なし

- Slot 4を無理に生成しない
- 次のAnalyzer候補で補充してよい
- ただし表示は`検出`とする

### スタイル候補なし

- データ不足を理由に非表示
- 次のAnalyzer候補で補充してよい
- `スタイル`と偽表示しない

### 全候補が5件未満

有効件数だけ表示する。

## 3.3 重複時

同じChordSymbolが複数sourceから出た場合、1件へ統合する。

```ts
interface QuickChordCandidate {
  chord: ChordSymbol;
  sources: QuickCandidateSource[];
  primarySource: QuickCandidateSource;
}
```

例:

```text
A6/9
検出・スムーズ
```

重複で空いた枠には、次点の有効候補を入れる。

---

# 4. 候補型

```ts
export type QuickCandidateSource =
  | "analyzer"
  | "smoothConnection"
  | "authorReferenceFit";

export interface QuickChordCandidateReason {
  code: string;
  labelKey: string;
  value?: number | string;
}

export interface QuickChordCandidate {
  chord: ChordSymbol;
  normalizedKey: string;

  primarySource: QuickCandidateSource;
  sources: QuickCandidateSource[];

  sourceScore: number;
  sourceRank: number;

  reasons: QuickChordCandidateReason[];
}
```

重要:

- Analyzer score、Smooth score、Style scoreは同じ尺度ではない
- source間でraw scoreを直接比較しない
- 固定quotaとsource内順位で5件を構成する
- `sourceScore`は各source内の順位付けにだけ使う

---

# 5. 候補組み立てpipeline

```text
Analyzer候補を取得
Smooth候補を生成
Style候補を取得
↓
各source内で順位付け
↓
ChordSymbol正規化
↓
現在コードを除外
↓
重複統合
↓
基本quotaへ配置
↓
欠落枠をAnalyzer次点で補充
↓
最大5件
```

純関数候補:

```ts
export function composeQuickChordCandidates(
  input: ComposeQuickChordCandidateInput,
): QuickChordCandidate[]
```

同じ入力から常に同じ候補順を返すこと。

---

# 6. Smooth候補生成

## 6.1 入力

```ts
export interface SmoothCandidateInput {
  previousChord?: ChordSymbol;
  currentChord: ChordSymbol;
  nextChord?: ChordSymbol;

  progression: readonly ChordSymbol[];
  targetIndex: number;

  key?: KeySignature;
  durationBeats: number;

  candidatePool: readonly ChordSymbol[];
}
```

先頭と末尾では、進行をLoopとして扱える場合に循環文脈を使う。

```text
先頭のprevious = 末尾
末尾のnext = 先頭
```

Loop扱いが不適切な保存進行では循環させない。既存block metadataを監査して決定する。

## 6.2 候補pool

最初から全コード語彙を総当たりしない。

候補poolは次から構成する。

- Analyzer内部Top-K
- 現在コードと同RootのQuality変形
- key内の近接機能コード
- slash / inversion候補
- Chord Drip Smoothロジックが生成する候補
- 既存Chord Drip pure helperを移植した候補

上限目安:

```text
20〜50件
```

## 6.3 Hard Validity

- parse可能
- `ChordSymbol`へ変換可能
- 試聴可能
- duration維持
- 現在コードと同一でない
- severe low-register collisionなし
- slash bassが有効
- 極端なvoice crossingなし

## 6.4 Smooth score

Chord Dripの既存pure logicを監査し、可能な限り同じ定義を移植する。

評価要素:

- 前コードとの共通Pitch Class
- 次コードとの共通Pitch Class
- Root移動距離
- Bass移動距離
- Guide Tone移動
- 推定Top Voice移動
- Key compatibility
- 前後機能との接続
- 低域衝突penalty
- foreign tone penalty

例:

```ts
smoothUtility =
  commonToneBonus
  + guideToneContinuityBonus
  + keyCompatibilityBonus
  - rootMotionCost
  - bassMotionCost
  - topVoiceMotionCost
  - collisionPenalty
  - foreignTonePenalty;
```

係数を新規に推測する前に、Chord Drip repositoryの次を監査する。

- `smoothConnection`
- Guided Repair candidate generation
- voice-leading helpers
- hard validity
- candidate trace
- canonical voicing生成

## 6.5 実Voicingがない場合

Loop Vaultの保存進行にVoicing情報がない場合、次の順で対応する。

1. Chord Dripと同じcanonical voicing helperを移植して推定
2. それが安全でなければPitch Class・Root・Bass中心のsymbol-level Smoothへ縮小
3. 実Voicingがあるかのような説明を表示しない

---

# 7. Style候補生成

## 7.1 方針

Chord Drip repositoryへruntime依存しない。

Loop Vault内のローカルデータから、作者の明示的な正例を派生index化する。

```text
Verified / accepted data
↓
Author Reference Index
↓
現在の前後文脈に近い接続を検索
↓
Style候補を最大1件
```

## 7.2 正例ソース

強い順:

1. `userVerified === true`の保存済み進行
2. 手動修正後に保存されたコード差分
3. correction feedbackで明示的に採用されたコード
4. Chord Dripから取り込まれたaccepted edit / Gold相当metadata
5. お気に入り進行

お気に入りだけを強い正解として扱わない。弱い補助証拠とする。

## 7.3 使用しないもの

- 未確認の自動検出結果
- Bronze相当だけの進行
- 表示しただけの候補
- previewしただけのコード
- rejected correction
- Live MIDI未確認履歴
- Judgeによる未検証予測

## 7.4 Author Reference Index

非永続の派生indexを作る。

```ts
export interface AuthorTransitionReference {
  previousDegree?: string;
  candidateDegree: string;
  nextDegree?: string;

  candidateQuality: string;
  bassRelation?: string;

  keyMode?: string;
  sourceStrength: number;
  sourceType:
    | "verifiedProgression"
    | "acceptedCorrection"
    | "chordDripAcceptedEdit"
    | "favoriteProgression";

  usageCount: number;
}
```

`data.json`へindexを保存しない。

元データ更新時に再構築または増分更新する。

## 7.5 Style検索

現在の文脈をKey非依存の度数へ正規化する。

評価要素:

- previous degree一致
- next degree一致
- target function一致
- candidate quality一致
- bass relation一致
- mode一致
- source strength
- usage count
- accepted correction一致

候補は現在のKeyへ再実音化する。

## 7.6 データ不足gate

次のいずれかを満たさない場合、Style候補を表示しない。

初期案:

```text
Verified transitionが5件以上
または
accepted correctionが3件以上
```

実装前に既存データ量を監査し、過剰に厳しい場合は理由付きで調整する。

UI表示:

```text
スタイル候補を作るための確認済みデータがまだありません
```

Quick Editor内へ常時大きく出さず、tooltipまたは開発者traceで確認可能にする。

---

# 8. Chord Dripロジック移植方針

## 8.1 最初に監査するもの

Chord Drip repository内の次を特定する。

- `smoothConnection`
- `authorReferenceFit`
- Guided Repair candidate型
- Hard Validity
- candidate deduplication
- canonical chord normalization
- key / degree変換
- voice-leading score
- Author Cell / accepted EditDelta retrieval
- availability trace

成果物:

```text
docs/phase3.7.1.2-chord-drip-strategy-audit.md
```

以下を表にする。

| Chord Drip要素 | Loop Vaultへ移植 | 適応 | 非対象 |
|---|---|---|---|

## 8.2 runtime依存禁止

次は禁止。

```text
Loop Vault
→ Chord Drip repositoryのsrcを直接import
```

移植方法:

- pure functionをLoop Vault側へコピー・適応
- 型をLoop Vaultの`ChordSymbol`へ合わせる
- provenanceコメントを残す
- 両repositoryがユーザー所有でも依存libraryのlicenseを確認
- 将来安定後に共通package化を検討

## 8.3 そのまま移植しないもの

- Chord Drip UIのラジアル配置
- Feedback Lab固有state
- RenderedClip
- standard Generate
- Fresh Seed
- Judge
- Global Voicing標準経路
- Chord Drip固有GenerationRecord

今回は候補生成ロジックだけをQuick Editorへ統合する。

---

# 9. Quick Editor UI

## 9.1 表示例

```text
検出候補
[1 A6/9] [2 A13] [3 F#m7/A]

修正提案
[4 スムーズ C#m7]
[5 スタイル Fmaj9/A]
```

候補カード内:

```text
スムーズ
C#m7
```

```text
スタイル
Fmaj9/A
```

## 9.2 Badge / Tooltip

```text
検出:
MIDI解析上の代替候補

スムーズ:
前後を自然につなぐ候補

スタイル:
確認済み進行や過去の修正傾向に近い候補
```

## 9.3 操作

既存を維持。

```text
1〜5
→ preview

Space
→ 試聴

Enter
→ 適用

Esc
→ 破棄
```

## 9.4 適用後

Smooth / Style候補もAnalyzer候補と同じ編集sessionへ適用する。

- selectedSlotId維持
- Undo / Redo
- 保存済み → 編集中
- autosave前のdirty state
- Inspector同期
- correction log

---

# 10. Feedback / ラベリングループ

Smooth / Style候補を選んだ事実を、保存成功時だけ記録する。

既存feedback schemaへoptional metadataを追加する。

```ts
export interface QuickCandidateSelectionMetadata {
  source:
    | "analyzer"
    | "smoothConnection"
    | "authorReferenceFit";

  sources?: Array<
    | "analyzer"
    | "smoothConnection"
    | "authorReferenceFit"
  >;

  candidateRank: number;
  displayedCandidateCount: number;
}
```

原則:

- previewだけでは記録しない
- Escで破棄した候補は採用扱いにしない
- 保存成功時の最終差分だけ記録
- Style indexへ即時自動学習させない
- 次回index再構築時にaccepted correctionとして利用可能
- feedback schema変更はoptional
- `fileVersion`は変更しない

評価指標:

- Smooth表示率
- Style表示率
- Smooth選択率
- Style選択率
- 保存後に残った率
- Undoされた率
- Analyzer候補選択率
- manual input率

---

# 11. 決定性

同じ入力と同じ参照データから、同じ候補を返す。

禁止:

- Math.random
- 現在時刻依存
- iteration order依存
- UIを開いた回数依存
- preview履歴依存
- 未保存draftをStyle正例へ即時追加

Style indexの同点処理:

1. source strength
2. context match
3. usage count
4. normalized chord key
5. stable source ID

---

# 12. 実装Stage

## Stage G0 — Audit

- Loop Vault現候補pipeline
- Chord Drip Smooth / Style
- 型差分
- data source
- license
- 移植範囲
- performance

## Stage G1 — Candidate Model / Composer

- source付き候補型
- quota
- dedup
- multiple source統合
- Analyzer 3枠
- fallback
- tests

## Stage G2 — Smooth Adapter

- candidate pool
- hard validity
- smooth score
- loop boundary
- reason trace
- shared fixtures
- tests

## Stage G3 — Author Reference Index / Style

- positive source audit
- derived index
- context normalization
- retrieval
- insufficient-data gate
- tests

## Stage G4 — Quick Editor UI / Feedback

- 検出候補 / 修正提案
- badges
- tooltip
- 1〜5
- apply
- optional feedback metadata
- i18n

## Stage G5 — QA

- Capture
- Progression Detail
- old 2-candidate data
- no Style data
- duplicate
- loop first/last
- performance
- lint
- tests
- typecheck
- build
- Tauri build
- final report

---

# 13. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.7.1.2を実装します。

仕様の正は
docs/phase3.7.1.2-smooth-style-candidate-integration.md
です。

目的:
Quick Chord Editorの最大5候補へ、
Chord Drip Guided Repairの
smoothConnection（スムーズ）と
authorReferenceFit（スタイル）を統合する。

絶対に守ること:

1. 最初にChord Dripの実装を監査する。
2. 推測でSmooth / Styleロジックを作り直さない。
3. Chord Drip repositoryへruntime依存しない。
4. pure logicだけをLoop Vaultへ移植・適応する。
5. Analyzer候補とRepair候補の意味をUIで区別する。
6. 基本構成はAnalyzer最大3 + Smooth最大1 + Style最大1。
7. 有効候補が少ない場合は無理に5件作らない。
8. Smooth / Style欠落枠はAnalyzer次点で補充してよい。
9. 補充候補をSmooth / Styleと偽表示しない。
10. current chordを候補から除外する。
11. ChordSymbolを正規化して重複除去する。
12. slash bass違いは別候補として維持する。
13. 同じ候補が複数sourceから出た場合はsourcesを統合する。
14. source間のraw scoreを直接比較しない。
15. 固定quotaとsource内順位で候補を構成する。
16. Smoothは前後コード・共通音・Bass・Guide Tone・
    Top Voice・低域衝突を考慮する。
17. 実Voicingがない場合はcanonical voicingまたは
    symbol-level評価へ縮小し、存在しない精度を装わない。
18. Styleは明示的な正例だけを使う。
19. 未確認の自動検出結果をStyle正例へ使わない。
20. Styleデータ不足時は候補なしにする。
21. 凍結Judge、standard Generate、Fresh Seedを使わない。
22. Author Reference Indexは非永続の派生データ。
23. Quick EditorとInspectorは同じedit sessionを使う。
24. 1〜5はpreview、Enterで適用、Escで破棄。
25. previewだけではfeedbackへ採用記録を残さない。
26. 保存成功時の最終差分だけcandidate sourceを記録する。
27. feedback追加フィールドはoptional。
28. SavedProgressionBlock schemaを変更しない。
29. fileVersionを変更しない。
30. MIDI解析の重み・defaultAnalyzerModeを変更しない。
31. Live MIDI・PlaybackControllerを変更しない。
32. UIをラジアルパレットへ変更しない。
33. 日本語 / Englishを実装する。
34. 同じ入力から同じ候補を返す。
35. 各Stageでlint / test / typecheck / buildを通す。

作業開始前:
- Chord Dripの対象ファイル
- smoothConnectionの入力・score・validity
- authorReferenceFitのデータ源・検索方式
- Loop Vault候補pipeline
- 移植するもの
- 適応するもの
- 移植しないもの
- risks
を報告する。

作業終了時:
- 変更ファイル
- Smooth実装
- Style実装
- Style正例件数
- 候補5件の構成例
- duplicate統合例
- no-candidate例
- feedback metadata
- tests
- manual QA
- 未解決事項
を報告する。

コミット:
P3.7.1.2-GX: 要約
```

---

# 14. テスト

## 14.1 Candidate Composer

- Analyzer 3 + Smooth 1 + Style 1
- Smoothなし
- Styleなし
- 両方なし
- 2件のみ
- 5件超
- current除外
- duplicate
- multi-source統合
- slash bass区別
- deterministic

## 14.2 Smooth

- 前後共通音増加
- Bass motion改善
- Guide Tone接続
- Top Voice移動
- loop先頭
- loop末尾
- low register collision除外
- current chord除外
- Chord Drip共有fixture

## 14.3 Style

- verified progression
- accepted correction
- Chord Drip accepted metadata
- favorite weak evidence
- unverified除外
- rejected除外
- insufficient data
- key transposition
- context match
- deterministic tie-break

## 14.4 UI

- 検出候補group
- 修正提案group
- badge
- tooltip
- 1〜5
- preview
- apply
- cancel
- old 2-candidate data
- no Style display

## 14.5 Feedback

- Analyzer selection
- Smooth selection
- Style selection
- previewのみ
- cancel
- Undo
- save success
- save failure
- optional schema compatibility

## 14.6 Regression

- Capture
- Progression Detail
- selection維持
- 5候補
- Library
- taxonomy
- Mood
- MIDI analysis
- Live MIDI
- PlaybackController
- autosave
- Backup
- Import / Export

---

# 15. 受け入れ条件

- Quick Editorに最大5件表示できる
- Analyzer候補と修正提案を区別できる
- Smooth候補が前後文脈を使う
- Style候補が明示的な作者正例を使う
- Styleデータ不足時に偽候補を表示しない
- 同一ChordSymbolを重複表示しない
- 複数source一致を候補へ表示できる
- current chordを候補へ出さない
- 1〜5 preview / Enter apply / Esc cancel
- CaptureとProgression Detailの両方で動く
- 保存後だけcandidate sourceを記録する
- runtime Chord Drip依存なし
- SavedProgressionBlock変更なし
- fileVersion不変
- defaultAnalyzerMode不変
- deterministic
- lint
- tests
- typecheck
- web build
- Tauri build

---

# 16. 最終メッセージ

Phase 3.7.1.2では、候補数を増やすだけではない。

```text
MIDI解析で元コードを推定する
+
前後へ自然につながるコードを提案する
+
作者の過去の好みに近いコードを提案する
```

**「正解を探す候補」と「良く直す候補」を、意味を混同せず同じQuick Editorから選べる状態にする。**
