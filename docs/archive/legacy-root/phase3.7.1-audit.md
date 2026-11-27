# Phase 3.7.1 実装監査

監査日: 2026-07-18

この文書は `docs/phase3.7.1-progression-detail-smart-library-plan.md` の着手前監査である。設計上の期待ではなく、`master` の実装を根拠に Phase 3.7.1 の変更境界を記録する。

## 1. 現在の画面と所有関係

### App / 画面遷移

- 画面状態は React Router ではなく `App` の `view` state で管理する。値は `home | capture | library | detail` の4種類である (`src/App.tsx`, `src/components/AppShell.tsx`)。
- 選択対象は `selectedId` 1個だけで、SongIdea IDを指す。SavedProgressionBlock IDを保持する画面状態はない (`src/App.tsx`)。
- Vaultの進行行で Enter、行末ボタン、double-clickを行うと、すべて親Ideaの `DetailView` を開く (`src/views/VaultView.tsx`)。
- Progression Detailは未実装である。

### Idea Detail

- `DetailView` はIdeaのタイトル、ステータス、Next Action、メタデータ、参考曲、アセット、保存済み進行を同じ画面で扱う (`src/views/DetailView.tsx`)。
- 保存済み進行は `ProgressionBlockCard` で再生、テキストコピー、削除、読み取り専用グリッド表示ができる。コード編集はできない (`src/views/DetailView.tsx`)。
- 保存済み進行の削除は `createUndoSnapshot()` と `removeProgressionBlock()` を通る。Undo猶予中の表示は `applyPendingDeletions()` が作る (`src/App.tsx`, `src/domain/undoDeletion.ts`)。

### Capture / 編集ワークスペース

- MIDI候補の編集UIは `CaptureView.tsx` 内の候補ワークスペースに組み立てられている (`src/views/CaptureView.tsx`)。
- 再利用可能な部品は `EditableProgressionGrid`, `EditableChordCard`, `ChordInspector`, `ProgressionEditorToolbar`, `ProgressionEditSummary` である (`src/components/progression-editing/*`)。
- 編集状態とUndo/Redoは純粋domainの `EditableProgression` に保持される。React、Zustand、Tauriへの依存はない (`src/domain/progressionEditing/*`)。
- `ChordInspector` は内部に独自の `draftLabel` / `draftChord` を持つ。Inspectorを閉じる前のpreviewと、`EditableProgression`へ適用済みの値は分離されている (`src/components/progression-editing/ChordInspector.tsx`)。
- Capture候補の編集結果は、保存時に `applyEditableProgression()` で `ProgressionBlockCandidate` へ戻される (`src/views/CaptureView.tsx`, `src/domain/progressionEditing/editableProgression.ts`)。

## 2. データモデルと永続化

### SavedProgressionBlock

- 保存済み進行は独立entityではなく `SongIdea.progressionBlocks?: SavedProgressionBlock[]` に内包される (`src/domain/types.ts`)。
- `SavedProgressionBlock` は構造化済み `ChordTimelineItem[]`、Key、BPM、拍子、出自、タグ、解析version、編集/検証フラグを持つ (`src/domain/types.ts`)。
- `tags: string[]` は既に永続化されるが、namespaceや分類categoryの検証はない (`src/domain/types.ts`, `src/domain/schema.ts`)。
- `suppressedAutoTags` と `manualUseTags` は未実装である。
- `fileVersion` は1固定である (`src/domain/types.ts`, `src/domain/schema.ts`)。

### Schema互換

- `progressionBlocks` はZodで `.default([])` のため、同フィールドがない旧Ideaもparseできる (`src/domain/schema.ts`)。
- 現在の `savedProgressionBlockSchema` は `.strict()` である。新フィールドを型だけに追加すると旧/新データの読込が一致しないため、型とZodを同じStageで変更する必要がある (`src/domain/schema.ts`)。
- 自動分類結果とProgression Indexはdata.jsonへ追加しない。
- 永続化を追加するのは自動タグの抑制情報のみとし、optional + defaultで旧データ互換を維持する。

### Store / autosave

- 全Vault変更は `createVaultStore()` 内部の `applyVaultChange()` を通り、既定500ms debounceで `flush()`される (`src/store/vaultStore.ts`)。
- `updateIdea()` で `progressionBlocks` 全体を差し替えることは可能だが、block単位更新の専用actionはない (`src/store/vaultStore.ts`)。
- S1では `updateProgressionBlock(ideaId, blockId, block)` を追加し、blockの存在確認、Ideaの `updatedAt`、`userEdited` を一箇所で扱う。
- repository直書きは行わない。atomic write、backup、import/export、close flushには変更を加えない (`src/domain/repository.ts`, `src/storage/tauriVaultStorage.ts`, `src/store/closeGuard.ts`)。

## 3. Undoと補正ログ

- Capture内のコード編集Undo/Redoは `EditableProgression.history` の画面内履歴である (`src/domain/progressionEditing/editHistory.ts`)。
- Vault削除Undoは `useUndoQueue()` と遅延commitを使う別系統である (`src/hooks/useUndoQueue.ts`, `src/App.tsx`)。
- 保存済み進行の編集では、編集中は `EditableProgression.history` を使い、保存確定時にblockを1回更新する。各キー入力をVaultへ保存しない。
- MIDI解析補正ログはCaptureが `buildCorrectionEvents()` と `appendAnalysisFeedback()` を直接呼ぶ (`src/views/CaptureView.tsx`, `src/storage/analysisFeedbackStorage.ts`)。
- 保存済みblockだけでは元の `MidiProgressionAnalysis` 全体が残っていないため、既存のCorrectionEventを正確に再構築できない。S1ではblockの `userEdited` を更新し、虚偽の解析補正ログは生成しない。この制約はS6報告へ残す。

## 4. Playback

- 全画面でsingletonの `playbackController` を共有し、source IDで再生元を識別する (`src/audio/playbackController.ts`)。
- 保存済み進行は `timeline` requestで再生できる (`src/views/VaultView.tsx`, `src/views/DetailView.tsx`)。
- コード単体試聴は `PlayToggle` と `ChordInspector` が既存経路を持つ (`src/components/PlayToggle.tsx`, `src/components/progression-editing/ChordInspector.tsx`)。
- Progression DetailとQuick Editorは新しい音声実装を作らず、同じcontrollerと既存音色設定を使う。

## 5. Vault一覧と検索

- `VaultView` は進行/Ideaの切替、文字検索、4/8/16小節、Key、source filename、手動tag、favorite、sortを持つ (`src/views/VaultView.tsx`)。
- 検索とsortは純関数 `filterAndSortProgressions()` が全Ideaを毎回走査する (`src/domain/progressionFilters.ts`)。
- 進行行は全件DOMへ描画され、virtualizationは未実装である (`src/views/VaultView.tsx`)。
- 「一覧 / ライブラリ」切替、category rail、分類tagのOR/AND、filter chipは未実装である。
- S3で非永続の `ProgressionIndexEntry[]` を純関数で構築し、S4でVault表示に利用する。storeへ別の永続sliceは追加しない。

## 6. Taxonomy / Chord Drip / PXF

- Loop Vaultにtaxonomy定義はない。`tags`は自由文字列である。
- Chord Drip repositoryにも `taxonomy` / `PXF` 実装は見つからなかった。Phase 3.7.1では計画書どおりruntime依存を追加しない。
- 現在のChord Drip連携は表示思想、試聴、テキストコピー、評価corpus manifestに限られる (`src/ui/ProgressionGrid.tsx`, `src/domain/progressionText.ts`, `src/domain/midi/evaluation/*`)。
- `SongIdea.chordDrip?: unknown` はplaceholderのままであり、本Phaseでも変更しない (`src/domain/types.ts`, `src/domain/schema.ts`)。
- `docs/taxonomy-v1.md` をLoop Vault側のversioned contractとして追加する。Chord Drip側への複製はこのrepositoryの変更範囲外とする。
- PXF出力は未実装であり、Phase 3.7.1の必須範囲外である。

## 7. i18n / Header / responsive

- 日本語/英語文言は `appCopy` と `progressionEditorCopy` に集約されている (`src/i18n.ts`)。
- 新画面・Quick Editor・Libraryの可視文言は両言語へ同時追加する。
- HeaderはHome/Capture/Vault navigation、New、再生停止、保存状態、Live MIDI、Settingsを一列に並べる (`src/components/AppShell.tsx`)。
- 保存記号に文字化けした文字列が残っている。S5のHeader整理でLucide iconへ置換する。
- CaptureのInspector responsive規約は既存CSSの `lv-candidate-workspace` / `lv-chord-inspector` にある (`src/styles.css`)。Progression Detailも同じbreakpoint思想を使う。

## 8. 性能監査

- 現在のVault進行一覧は `ideas.flatMap()`、Set生成、filter/sort、全件renderを行う (`src/views/VaultView.tsx`)。
- 1,000件での明示的なbenchmark/testはない。
- S3のIndex構築・検索は現在時刻とrandomに依存しない純関数にする。
- S4では200件超の表示windowingを行う。固定行高を使い、scroll位置から可視範囲とoverscanを決定する。
- 目標は1,000件のindex構築、filter、category countを各100ms以内とする。CIの速度差を考慮し、回帰テストは十分な上限を持たせ、実測値をS6報告へ記録する。

## 9. Stage別の変更境界

### S1 Progression Detail

- `AppView`とApp stateへProgression Detail選択を追加する。
- Vault行はProgression Detailを開き、Ideaカードは従来どおりIdea Detailを開く。
- 保存済みblockを編集用candidateへ変換し、既存domain/componentsで編集する。
- 保存は専用store actionから `applyVaultChange()` を通す。

### S2 Quick Chord Editor

- `QuickChordEditor`を共用componentとして追加する。
- `EditableChordCard/Grid`へEnter、hover icon、context menu、Shift+F10の入口を追加する。
- Quick EditorとInspectorは同じ `EditableProgression` へのcommandを呼ぶ。未適用previewだけをQuick Editor local stateに持つ。

### S3 Taxonomy / Derived Tags / Index

- `src/domain/progressionClassification/*` に純粋層を追加する。
- `suppressedAutoTags`のみ永続化する。派生tagとindexは永続化しない。
- 自動分類はsource、客観feature、限定的useを実装する。

### S4 Library

- Vault内の進行表示に一覧/ライブラリ切替を追加する。
- 同category内OR、category間ANDでindexを絞り込む。
- 200件超でwindowingし、既存keyboard、sort、search、再生状態を維持する。

### S5 Mood / Header

- Moodは閾値・理由・最大2件をテストし、低品質なら延期する。
- Header整理はMoodの採否に関係なく実施する。

### S6 QA

- 旧data、1,000件、Capture、Progression Detail、Quick Editor、Library、Live MIDI、import/export、backup、i18n、keyboard、Tauri buildを検証する。
- 最終報告を `docs/phase3.7.1-work-report.md` に残す。

## 10. 既知のリスク

- `CaptureView.tsx` は大きく、編集ワークスペースの組み立てが画面内に密集している。S1では共通domain/componentを利用し、Capture全体の大規模refactorは避ける。
- `ChordInspector`はlocal draftを持つため、Quick Editorと同時に開かないよう単一のactive editor stateで制御する。
- SavedProgressionBlockは親Ideaに内包されるため、Progression Detail表示中に親Ideaまたはblockが削除された場合のfallbackが必要である。
- 自由文字列の既存tagsとstable taxonomy IDを混同しない。派生tagは別配列として扱う。
- source filenameだけでは「MIDI Capture」と「Manual」を常に完全判定できない。保存済みmetadataに基づく決定的な範囲だけを分類する。
- Keyがないblockへdiatonic/chromatic/secondary-dominant/modal-mixtureを推測付与しない。
