# Phase 3.6.3 実装監査

## 1. 監査範囲

- Loop Vault: `src/views/CaptureView.tsx`, `src/ui/ProgressionGrid.tsx`, `src/domain/chords.ts`, `src/domain/midi/feedback.ts`, `src/storage/analysisFeedbackStorage.ts`, `src/store/vaultStore.ts`, `src/i18n.ts`
- Chord Drip: `D:/dev/Chord Drip作成/src/ui/ProgressionGrid.tsx`, `src/ui/inspector/ChordInspector.tsx`, `src/ui/shortcuts.ts`, `src/domain/inspectorTarget.ts`, `src/ui/RadialChordPalette.tsx`, `src/audio/*`
- 仕様: `docs/phase3.6.3-progression-editing-workspace-plan.md`

## 2. 現在のLoop Vault

### Capture構造

- `src/views/CaptureView.tsx`は1208行あり、MIDI選択、候補表示、カード編集、試聴、保存ダイアログ、feedback書込を同居させている。
- 候補は`expandedCandidateId`で1件だけ展開される。これはPhase 3.6.3でも再利用できる。
- `ProgressionCandidateCard`は候補をローカル`ChordTimelineItem[]`へコピーし、ラベル入力による置換と全体resetを持つ。ただし`originalChord/currentChord`、履歴、編集方法、split/merge/deleteは持たない。
- `ProgressionGrid`はカード選択と再生表示を持つが、通常カードへ拍位置とconfidence百分率を常時表示しており、Phase 3.6.3の静かな通常表示と相違する。

### コード型とパーサ

- `ChordSymbol`は`root`, `quality`, `tensions`, `bass?`, `label`を持つ。`src/domain/types.ts`。
- `ChordTimelineItem.alternatives`は`{ chord: ChordSymbol; confidence: number }[]`としてインライン定義され、独立した`ChordAlternative`型はない。
- `parseChordLabel()`と`makeChordSymbol()`はRoot / Quality / Bass編集に再利用できる。`src/domain/chords.ts`。
- 対応qualityは21種類。Structure Editorはこのunionを正として選択肢を作る必要がある。

### 保存とfeedback

- 新規保存は`createIdeaFromDraft()`、既存Idea追加は`appendBlockToIdea()`を通り、どちらも`applyVaultChange()`経由でautosaveされる。repository直書きはない。`src/store/vaultStore.ts`。
- 保存対象は`ProgressionBlockCandidate.chords`であるため、編集ワークスペースは保存直前に`applyEditableProgression()`した候補を渡せば既存経路を再利用できる。
- 現行`buildCorrectionEvents()`は元候補と編集候補を配列indexで比較する。replaceには使えるが、split/merge/delete後には対応できない。`src/domain/midi/feedback.ts`。
- feedback schemaの`editMethod`は`manual-label | alternative-selection`のみで、`structure-editor`を表現できない。
- 現行Captureの一回保存はfeedback appendを保存処理より先に開始するため、「保存成功時だけ記録」というPhase 3.6.3要件と相違する。Stage 5で保存成功後へ移す必要がある。

## 3. Chord Drip流用判断

### 流用する思想・挙動

- コードカード全体を選択対象にし、`aria-pressed`、selected、playing、editedを別状態として表示する。`src/ui/ProgressionGrid.tsx`。
- 再生中は再生対象へ追従し、手動選択時は追従を解除する考え方。`src/domain/inspectorTarget.ts`。
- input / textarea / select / contenteditable上ではグローバルショートカットを無効化する判定。`src/ui/shortcuts.ts`。
- Inspectorをカード外へ集約し、コード名、位置、試聴を明確に分ける構成。`src/ui/inspector/ChordInspector.tsx`。
- Tone.js音源と単体試聴の仕組みは、既にLoop Vaultの`src/audio/chordPreview.ts`へ適応済みなので再コピーしない。

### 直接流用しないもの

- `RadialChordPalette`と`generateGuidedRepairCandidates()`は生成AI的な修復候補であり、MIDI analyzer alternativesを正とする今回の要件とは異なる。
- Chord Dripの`ProgressionGrid`は`DisplayProgression`、voicing、生成ルールへ依存するため、コンポーネントをそのままコピーしない。
- Chord DripのCSS class/tokenはLoop VaultのTailwind/CSS変数と互換ではない。視覚状態だけをLoop Vaultのデザインへ移植する。
- Chord Drip repositoryへのruntime import、workspace参照、共通package化は行わない。

## 4. 実装境界

### Domain

`src/domain/progressionEditing/`へ型、作成/適用、replace/reset、history、summary、split/merge/delete、validationを置く。React、Zustand、Tauri、Tone.js、現在時刻へ依存させない。slot IDは入力候補IDと位置から決定的に生成する。

### UI

`src/components/progression-editing/`へカード、grid、Inspector、alternatives、Structure Editor、summary、toolbarを置く。編集状態は候補ワークスペースが所有し、永続化しない。

### Capture

`CaptureView`はMIDI解析結果、候補選択、保存経路の調停だけを担当する。候補固有の編集・履歴・キーボード処理を`ProgressionCandidateWorkspace`へ移す。

## 5. 主要リスクと対策

| リスク | 対策 |
|---|---|
| 元候補をmutateしてfeedbackの元値を失う | Domain変換は全て新しいobject/arrayを返し、originalを保持する |
| split/merge/deleteでindex比較feedbackが壊れる | slot IDと元範囲を基準に最終差分イベントを組み立てる |
| 保存失敗でもfeedbackが残る | store変更成功後にのみappendし、キャンセル時は呼ばない |
| undo履歴が巨大化する | 最大100操作、redo branchは新規操作時に破棄 |
| 4/4前提の位置計算 | Phase 3.6.3では既存UIと同じ4拍を明示し、validationでduration/overlapを保証する |
| CaptureViewがさらに肥大化する | Stage 2からUIを別ディレクトリへ分割する |
| keyboardが入力やIMEを妨げる | editable targetと`isComposing`を先に除外する |
| 一回保存と保存ダイアログで挙動が分岐する | 両方とも同じ`applyEditableProgression()`と保存成功後feedback関数を通す |

## 6. Stage方針

- Stage 1: UIへ触れず、replace/reset/history/summaryとsplit/merge/deleteの時間モデルまで純関数で固める。
- Stage 2: 既存カードの試聴を維持しつつ、選択GridとInspector shellへ置換する。
- Stage 3-4: alternatives、直接入力、Undo/Redo、Root/Quality/Bassを追加する。
- Stage 5: 保存候補を`currentChord`列から生成し、feedbackを保存成功後へ移す。
- Stage 6: split/merge/deleteをUIへ接続する。Domain整合性が満たせない場合のみ延期する。
- Stage 7: i18n、responsive、accessibility、全回帰、Tauri build、最終報告を行う。

## 7. 非変更事項

- MIDI解析、`defaultAnalyzerMode`、reranker、評価コーパスは変更しない。
- `VaultFile.fileVersion`は1のまま。
- 編集履歴と解析結果は`data.json`へ保存しない。
- repositoryおよびatomic save/backupsの実装は変更しない。
