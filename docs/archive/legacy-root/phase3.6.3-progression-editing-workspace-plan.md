# Loop Vault Phase 3.6.3 Codex作業指示書
## Progression Editing Workspace — コードカードを直接触って、聴いて、直して、保存する

---

## 0. 結論

Phase 3.6.3では、コード採集画面を「解析結果を見る画面」から、**コード進行を直接校正する編集ワークスペース**へ改修する。

現在の課題は、コードカードを選択できても、そのコードを対象として直感的に差し替えられないことにある。

完成後の主導線は次のとおり。

```text
候補進行を試聴
↓
怪しいコードカードをクリック
↓
右側Inspectorで元の検出値と現在値を確認
↓
alternatives・直接入力・Root/Quality/Bass編集で差し替え
↓
変更後のコードを即試聴
↓
進行全体を再生
↓
変更内容を確認
↓
Vaultへ保存
```

Chord Dripのコードカード、選択状態、コード試聴、Root / Quality / Bass編集の思想を流用する。ただし、Chord Dripへruntime依存せず、Loop Vault固有の以下を追加する。

- 元の検出コード
- analyzer alternatives
- confidence / warnings
- 編集済み状態
- 元に戻す
- 保存前差分
- 修正ログ
- source MIDI範囲

---

# 1. テーマ

**「解析結果を眺めるのではなく、コードカードを直接触って正しい進行へ仕上げる」**

Loop Vaultは完全自動認識を目的としない。誤検出がある前提で、少ない操作で保存可能な進行へ到達できることを優先する。

評価軸:

- 編集対象が明確か
- 元の検出値と変更後が分かるか
- 候補から素早く差し替えられるか
- 手入力できるか
- 変更後をすぐ聴けるか
- 元に戻せるか
- 保存前に変更内容を把握できるか
- 修正ログへ正しく記録されるか

---

# 2. 前提

現在のLoop Vaultには以下がある。

- MIDI解析
- Candidate Blocks
- ProgressionGrid
- コード単体試聴
- 候補全体試聴
- 新規Idea保存
- 既存Idea追加
- コード進行コピー
- `ChordSymbol`
- `ChordTimelineItem`
- `parseChordLabel()`
- `formatProgressionText()`
- 保存済みProgression Block
- analysis feedback JSONL
- Gold / Silver / Bronze評価フライホイール
- Chord Drip由来のコードカード表示資産

Phase 3.6.3ではMIDI解析アルゴリズムを変更しない。

---

# 3. スコープ

## 3.1 実装するもの

- 編集可能なProgression Grid
- コードカード選択
- 右側Chord Inspector
- 元の検出コード表示
- 現在の編集コード表示
- analyzer alternatives
- コード名直接入力
- Root / Quality / Bass編集
- 選択コード試聴
- 編集後進行の全体試聴
- 適用 / 元に戻す / すべて元に戻す
- 編集済みマーク
- 保存前変更一覧
- Undo / Redo
- キーボード操作
- 修正ログ連携
- 候補カードは1つだけ展開
- レスポンシブ対応
- 基本的なコード分割・結合
- コード削除 / 前コード継続
- テスト / lint / build / tauri build

## 3.2 実装しないもの

- MIDI解析精度の変更
- `defaultAnalyzerMode`変更
- AIによるコード提案
- 自動リハーモナイズ
- Chord Dripとの直接通信
- Chord Drip repositoryへのruntime依存
- MIDIノートそのものの編集
- ピアノロール
- 自動voice leading修正
- 完全な機能和声分析
- undo stackの永続化
- クラウド同期

---

# 4. UX原則

## 4.1 コードカードを直接選ぶ

候補カード全体の「編集」ボタンを主操作にしない。

ユーザーは直したいコードカードを直接クリックする。

クリック後:

- カードが選択状態になる
- 右Inspectorが更新される
- 元の検出値と現在値を表示
- alternativesを表示
- 試聴対象になる

## 4.2 元の検出値を失わない

検出結果を直接上書きしない。

```text
originalChord
currentChord
edited
```

を保持する。

これにより、元に戻す、差分表示、修正ログ、保存前確認を可能にする。

## 4.3 通常表示は静かにする

通常カードで常時出さないもの:

- `1.1` / `1.3`
- `100%`
- 内部warning名
- alternatives一覧
- 入力フォーム

通常表示例:

```text
Aadd9/C#
Iadd9 · bass 3rd
```

低confidence時のみ小さく `要確認` を表示する。

## 4.4 編集モードで情報を増やす

Inspectorへ集約する。

- 小節 / 拍
- 元の検出値
- 現在値
- confidence
- warning
- alternatives
- Root / Quality / Bass
- 直接入力
- 試聴
- 適用
- 元に戻す

## 4.5 候補は1つだけ展開

他候補はコンパクト表示にする。

```text
候補2  1–8小節
| Dmaj9 | Aadd9/C# | Bm11 | F#m9 | ...
[▶] [保存]
```

選択中候補だけ、コードグリッド＋Inspector＋変更一覧を表示する。

---

# 5. 推奨レイアウト

```text
┌──────────────────────────────────────────────────────────────┐
│ 候補1  1–4小節  メイン・イントロ向き        [▶] [保存] […] │
├─────────────────────────────────────┬────────────────────────┤
│ [ Dmaj9 ] [ G7 ]                    │ 選択中のコード         │
│ [ Aadd9/C# ] [ C13 ]                │                        │
│ [ Bm11 ] [ Bm11/C# ]                │ 元の検出 Aadd9/C#      │
│ [ F#m9 ] [ G13/E ]                  │ 現在     A6/C#         │
│                                     │                        │
│                                     │ 候補                   │
│                                     │ [A6/C#] [F#m7/C#]      │
│                                     │                        │
│                                     │ Root    [A ▼]          │
│                                     │ Quality [6 ▼]          │
│                                     │ Bass    [C# ▼]         │
│                                     │                        │
│                                     │ [▶ 試聴] [適用]        │
│                                     │ [元に戻す]             │
├─────────────────────────────────────┴────────────────────────┤
│ 変更 2件                                                      │
│ 2小節目 Aadd9/C# → A6/C#                                    │
│ 4小節3拍 G13/E → Em7                                         │
└──────────────────────────────────────────────────────────────┘
```

Inspector幅の目安は320〜380px。狭い画面では下部ドロワーへ切り替える。候補が縦長の場合はInspectorをstickyにする。

---

# 6. データモデル

## 6.1 EditableChordSlot

```ts
export interface EditableChordSlot {
  id: string;

  position: {
    bar: number;
    beat: number;
    durationBeats: number;
  };

  originalChord: ChordSymbol;
  currentChord: ChordSymbol;

  alternatives: ChordAlternative[];
  confidence?: number;
  warnings: string[];

  edited: boolean;
  editSource?:
    | "manual-label"
    | "alternative"
    | "structure-editor"
    | "split"
    | "merge"
    | "delete"
    | "reset";
}
```

## 6.2 EditableProgression

```ts
export interface EditableProgression {
  candidateId: string;
  slots: EditableChordSlot[];
  selectedSlotId?: string;
  history: ProgressionEditOperation[];
  historyIndex: number;
}
```

## 6.3 Operation

```ts
export type ProgressionEditOperation =
  | ReplaceChordOperation
  | SplitChordOperation
  | MergeChordOperation
  | DeleteChordOperation;
```

## 6.4 非破壊変換

`ProgressionBlockCandidate.chords`を編集中にmutateしない。

```ts
export function createEditableProgression(
  candidate: ProgressionBlockCandidate,
): EditableProgression;

export function applyEditableProgression(
  candidate: ProgressionBlockCandidate,
  editable: EditableProgression,
): ProgressionBlockCandidate;
```

---

# 7. Domain構成

```text
src/domain/progressionEditing/
  types.ts
  editableProgression.ts
  chordReplacement.ts
  splitMerge.ts
  editHistory.ts
  editSummary.ts
  validation.ts
  index.ts
```

`src/domain`からReact、Zustand、Tauri、Tone.jsをimportしない。

---

# 8. UIコンポーネント

```text
src/components/progression-editing/
  EditableProgressionGrid.tsx
  EditableChordCard.tsx
  ChordInspector.tsx
  ChordAlternativeList.tsx
  ChordStructureEditor.tsx
  ProgressionEditSummary.tsx
  ProgressionEditorToolbar.tsx
```

## 8.1 EditableChordCard

表示:

```text
Aadd9/C#
Iadd9 · bass 3rd
```

状態:

- normal
- selected
- playing
- edited
- review

編集済み例:

```text
A6/C#  ✎
```

## 8.2 ChordInspector

表示:

- 位置
- 元の検出値
- 現在値
- confidence / warnings
- alternatives
- direct input
- Root / Quality / Bass
- degree
- preview
- apply
- reset

## 8.3 ProgressionEditSummary

保存前の変更一覧を表示し、該当コードへ移動・個別reset・全resetを可能にする。

---

# 9. Chord Drip資産の流用

## 9.1 監査対象

Codexは着手前にChord Drip repositoryの以下を確認する。

- コードカード
- ProgressionGrid
- Root picker
- Quality picker
- Bass / inversion picker
- chord preview
- keyboard navigation
- parse / label formatting
- editing state
- CSS / tokens

## 9.2 流用方針

Phase 3.6.3では、必要な部品をLoop Vaultへコピー・適応する方式を推奨する。

共通package化は、両アプリの要件が安定してから検討する。

Loop Vault固有追加:

- Original detection
- Current edit
- Alternatives
- Confidence
- Warnings
- Reset
- Feedback log
- Source position
- Edit summary

---

# 10. 編集方法

## 10.1 Alternative選択

```text
カード選択
↓
alternative選択
↓
試聴
↓
適用
```

## 10.2 直接入力

```text
[A6/C#________________]
```

`parseChordLabel()`で検証する。

エラー文:

```text
コード名を認識できません
例: Cmaj7, F#m9, G13/B
```

## 10.3 Structure Editor

最低限:

```text
Root
Quality
Bass
```

Phase 3.6.3ではExtension / Alteration / Omitは必須としない。

## 10.4 Reset

- 個別resetはoperationとして履歴へ残す
- 全体resetは確認後、1操作として履歴へ追加

---

# 11. 試聴

- Inspectorの`▶ 試聴`で`currentChord`を鳴らす
- 元の検出コードも比較試聴可能
- 候補上部の`▶`は編集後の進行全体を再生
- 編集開始時に進行再生を停止
- 再生中のみ停止アイコンを表示

---

# 12. キーボード操作

```text
← / →        前後のコード
↑ / ↓        グリッド上下移動
Enter        直接入力へフォーカス
Space        選択コードを試聴 / 停止
Ctrl+Z       Undo
Ctrl+Shift+Z Redo
Esc          入力キャンセル / Inspectorを閉じる
Delete       削除操作
```

input、select、textarea、IME変換中ではグローバルショートカットを無効にする。

---

# 13. Split / Merge / Delete

## 13.1 Split

区間中央で2分割する。

4/4の1小節なら初期値は3拍目。

## 13.2 Merge

時間的に隣接しgapがないslotだけ統合できる。

統合時は、前後どちらのコードを残すか選択する。

## 13.3 Delete

MVPでは次を推奨する。

- 前コード継続
- 先頭slotなら次コードへ結合

No Chordは後回しでもよい。

## 13.4 整合性

split / merge / delete後に以下を保証する。

- startBeat昇順
- duration > 0
- overlapなし
- block length維持
- bar / beat再計算

---

# 14. Undo / Redo

対象:

- replace
- split
- merge
- delete
- reset

上限100 operations。

未保存変更がある状態で別候補へ移動する場合は確認する。

---

# 15. 保存

- 保存対象は`currentChord`列
- 新規Ideaは`createIdeaFromDraft()`
- 既存Ideaは`appendBlockToIdea()`
- `applyVaultChange()`経由
- repositoryへ直接書かない

保存前に変更一覧を表示する。

```text
この進行には2件の修正があります
Aadd9/C# → A6/C#
G13/E → Em7
```

`userVerified`の既存規則を維持する。

- 明示修正slotはfeedback上Gold
- 保存ブロックはSilver
- userVerified ONならブロック全体をGold候補

---

# 16. Analysis Feedback連携

## 16.1 記録対象

- manual-label
- alternative
- structure-editor

## 16.2 ログタイミング

Inspectorの適用時ではなく、保存成功時に記録する。

理由:

- 適用後にresetする可能性
- 保存されない試行をGoldにしない
- 最終保存値だけを記録

## 16.3 イベント例

```ts
export interface ProgressionChordCorrectionEvent {
  schemaVersion: 1;
  sourceAnalyzer: string;
  sourceFingerprint?: string;
  candidateId: string;
  range: {
    startBeat: number;
    endBeat: number;
  };
  original: string;
  corrected: string;
  alternatives: string[];
  editSource:
    | "manual-label"
    | "alternative"
    | "structure-editor";
  context?: {
    previousChord?: string;
    nextChord?: string;
    key?: string;
  };
}
```

同一slotを複数回変更した場合、最終差分だけを保存する。

---

# 17. UI文言

日本語:

```text
選択中のコード
元の検出
現在のコード
候補
コード名を入力
Root
Quality
Bass
元の検出を試聴
現在のコードを試聴
適用
元に戻す
すべて元に戻す
変更内容
コードを分割
前のコードと結合
次のコードと結合
コードを削除
```

すべて`i18n.ts`へ寄せる。

---

# 18. デザイン

- Normal: dark surface / subtle border
- Selected: mint border / subtle background
- Playing: playback progress
- Edited: pencil icon
- Review: amber chip
- Inspectorはsurfaceを一段明るくする
- primaryは`適用`のみ
- previewはsecondary
- resetはghost

---

# 19. CaptureView分割

CaptureViewが大きい場合、Phase 3.6.3で次へ分割する。

```text
src/views/capture/
  CaptureCandidateList.tsx
  ProgressionCandidateWorkspace.tsx
  ProgressionCandidateHeader.tsx
  ProgressionSaveDialog.tsx
```

編集ロジックをCaptureViewへ直接増やし続けない。

---

# 20. 実装Stage

## Stage 0: Audit & Chord Drip Review

- 現在のCaptureView
- ProgressionGrid
- Chord Drip UI
- parseChordLabel
- chord preview
- feedback log
- save flow
- i18n

成果物:

```text
docs/phase3.6.3-audit.md
```

## Stage 1: Editable Domain Model

- EditableChordSlot
- EditableProgression
- create/apply
- replace/reset
- edit summary
- operation history
- pure tests

UI変更なし。

## Stage 2: Selectable Grid & Inspector Shell

- EditableProgressionGrid
- chord selection
- selected state
- Inspector
- original / current表示
- responsive
- one candidate expanded

## Stage 3: Replacement Editing

- alternatives
- direct input
- parse validation
- preview detected/current
- apply/reset
- edited marker
- undo/redo
- keyboard

ここで「コード差し替え」を完成させる。

## Stage 4: Chord Drip-style Structure Editor

- Root
- Quality
- Bass
- ChordSymbol生成
- preview
- apply
- tests

## Stage 5: Save & Feedback

- currentChord列を保存
- save dialog変更
- edit summary
- correction feedback
- userVerified
- Gold / Silver分類
- store actions

## Stage 6: Split / Merge / Delete

- split
- merge previous/next
- delete/continue
- time integrity
- undo/redo
- playback

不要または危険ならPhase 3.6.3.1へ延期し、理由を報告する。

## Stage 7: Polish & QA

- Chord Drip visual parity
- responsive
- sticky Inspector
- keyboard
- i18n
- accessibility
- performance
- lint
- test
- build
- tauri build
- installer
- final report

---

# 21. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.6.3を実装します。

仕様の正は
 docs/phase3.6.3-progression-editing-workspace-plan.md
です。

目的:
コード採集画面を、検出結果を表示する画面から、
コードカードを直接選択して試聴・差し替え・保存できる
Progression Editing Workspaceへ改修する。

絶対に守ること:

1. MIDI解析アルゴリズムを変更しない。
2. defaultAnalyzerModeを変更しない。
3. originalChordとcurrentChordを分ける。
4. 編集ロジックはsrc/domainの純関数として実装する。
5. src/domainからReact、Zustand、Tauri、Tone.jsをimportしない。
6. Candidateの元データを編集中にmutateしない。
7. コードカードをクリックして編集対象を選択できるようにする。
8. 元の検出値と現在値を同時に表示する。
9. alternatives、直接入力、Root/Quality/Bass編集を提供する。
10. 変更後コードを即試聴できるようにする。
11. 保存するのはcurrentChord列。
12. 元検出値は修正ログ用に保持する。
13. 修正ログは保存成功時だけ記録する。
14. 保存は既存store actionとapplyVaultChangeを通す。
15. repositoryへ直接書かない。
16. Gold / Silver / Bronze規則を壊さない。
17. fileVersionを上げない。
18. Chord Drip repositoryへruntime依存しない。
19. 既存コードカードの良さを壊さない。
20. 拍位置・100%を通常カードへ大量表示しない。
21. 候補は1つだけ展開する。
22. input / textarea / IMEをkeyboard操作で邪魔しない。
23. 各Stageでlint、test、buildを通す。
24. Phase 3.6 / 3.6.1 / 3.6.2の評価機能を壊さない。

作業開始前:
- 関連ファイル
- CaptureView構造
- Chord Drip流用候補
- 保存経路
- feedback経路
- 変更計画
- リスク
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- 流用したChord Drip資産
- テスト結果
- UI確認項目
- 未解決事項
- 次Stageへの申し送り
を報告する。

コミット:
P3.6.3-XX: 要約
```

---

# 22. テスト

## Domain

- create editable
- original/current
- replace/reset/reset all
- alternatives
- undo/redo
- dirty
- summary
- apply to candidate
- immutable
- deterministic

## Parse

- Cmaj7
- F#m9
- Bb6/9
- G13/B
- sus / altered
- invalid

## Split / Merge

- midpoint split
- merge adjacent
- no gap / no overlap
- duration preserved
- first / last slot delete

## UI

- card click
- selected display
- Inspector update
- alternative
- direct input
- invalid input
- preview
- apply/reset
- edited icon
- summary
- one candidate expanded
- unsaved candidate switch warning

## Keyboard

- arrows
- Enter
- Space
- Ctrl+Z / Ctrl+Shift+Z
- Esc
- IME
- input focus
- modal

## Save / Feedback

- new Idea
- append
- currentChord saved
- correction log on successful save
- no log after reset
- no log on canceled save
- userVerified
- Gold/Silver/Bronze

## Regression

- MIDI selection
- candidate generation
- full timeline
- copy
- legacy analyzer
- reranker
- real MIDI evaluation CLI
- Vault / Detail

---

# 23. 人間側確認

## Stage 2

- カードをクリックしたら対象が分かる
- Inspectorが邪魔でない
- 1候補だけ展開

## Stage 3

```text
Aadd9/C# → A6/C#
G13/E → Em7
```

を差し替え、元値・現在値・候補・試聴・Undoを確認する。

## Stage 4

- Root / Quality / Bass
- Chord Dripと似た速度
- 分数コード
- 長いコード名
- degree更新

## Stage 5

- 保存前差分
- 新規Idea / 既存Idea
- Vault表示
- correction log
- canceled saveではログなし

## Stage 6

- 1小節1コードを2コードへ分割
- 誤分割を結合
- コード削除
- timeline整合

---

# 24. 受け入れ条件

- コードカードを直接クリックして編集対象にできる
- 選択中コードが一目で分かる
- 元の検出と現在値が同時に見える
- alternativesから1クリックで差し替えられる
- コード名を直接入力できる
- Root / Quality / Bassで編集できる
- 元コードと変更後を試聴できる
- 編集後の進行全体を試聴できる
- 個別reset / Undo / Redo
- 保存前に変更一覧が見える
- currentChordが保存される
- 明示修正がanalysis feedbackへ入る
- canceled / reset済み修正はログへ入らない
- 候補は1つだけ展開
- 通常カードで拍位置・100%を大量表示しない
- split / mergeが実装されるか、延期理由が報告される
- 既存MIDI解析・評価フライホイールを壊さない
- lint / test / build / tauri build

---

# 25. 完成イメージ

```text
コードカードをクリック
↓
右側で候補を聴く
↓
正しいコードへ差し替える
↓
進行全体を鳴らす
↓
そのままVaultへ保存する
```

**コード採集を、コード進行の校正ワークスペースへ進化させる。**

これをPhase 3.6.3の完成形とする。
