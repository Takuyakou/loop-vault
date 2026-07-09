# Loop Vault Phase 2.5 作業報告書

作成日: 2026-07-10  
対象リポジトリ: `Takuyakou/loop-vault`  
対象範囲: Phase 2.5 のPR #5〜#10  
現在の状態: 全PRを `master` へマージ済み。Open PRは0件。

## 1. Phase 2.5 の目的

Phase 2.5では、Phase 2で追加したMIDI解析機能を「実際に使いやすい作曲ネタ管理UI」に近づけるため、Capture画面とLibrary/Detail周辺を整理しました。

主な狙いは以下です。

- MIDI解析結果を、タイムライン全体よりも「保存候補」を中心に見られるようにする
- 候補ごとのコード進行を視覚的に確認し、試聴し、必要なら編集できるようにする
- 気に入った進行を新規Ideaまたは既存Ideaへ保存しやすくする
- Chord Dripへ貼り付けやすいテキスト形式でコード進行をコピーできるようにする
- Library一覧でも保存済み進行の存在が分かるようにする
- MIDIファイル選択時に、ダイアログだけでなくドラッグ&ドロップにも対応する

## 2. マージ済みPR一覧

| PR | タイトル | ブランチ | マージ先 | 内容 |
|---:|---|---|---|---|
| #5 | P2.5-A: Capture画面を候補中心に整理 | `feature/p2-5-capture-layout` | `master` | Capture画面を候補中心の構成へ整理 |
| #6 | P2.5-B: 候補カードの表示を整理 | `feature/p2-5-candidate-cards` | `master` | 候補カードの表示、信頼度、警告、編集UIを整理 |
| #7 | P2.5-C: 進行保存モーダルを追加 | `feature/p2-5-save-dialog` | `master` | 候補保存をモーダル化し、新規/追記/メモコピーを選択可能に |
| #8 | P2.5-D: Chord Drip形式コピーを追加 | `feature/p2-5-chord-drip-copy` | `master` | Chord Dripへ貼りやすいコード進行テキスト生成/コピーを追加 |
| #9 | P2.5-E: Libraryに進行ミニプレビューを追加 | `feature/p2-5-library-progression-preview` | `master` | Libraryカードに保存済み進行の概要を表示 |
| #10 | P2.5-F: MIDIファイルをドラッグ&ドロップで読み込む | `feature/p2-5-midi-drag-drop` | `master` | MIDI選択画面へのドラッグ&ドロップ読み込みを追加 |

マージ後の最新コミット:

```text
73cb567 Merge pull request #10 from Takuyakou/feature/p2-5-midi-drag-drop
```

## 3. 実装サマリ

現行アプリで、Phase 2.5後にユーザーができることは以下です。

- Capture画面でMIDIファイルを選択して解析できる  
  根拠: `src/views/CaptureView.tsx`, `chooseMidi()`

- Capture画面にMIDIファイルをドラッグ&ドロップして解析できる  
  根拠: `src/views/CaptureView.tsx`, `getCurrentWebview().onDragDropEvent()`, `handleDrop()`, `analyzeMidiPath()`, `analyzeDroppedFile()`

- 解析結果の候補をカード単位で確認できる  
  根拠: `src/views/CaptureView.tsx`, `ProgressionCandidateCard`

- 候補カード内でコード進行グリッドを確認し、コード単位/候補全体を試聴できる  
  根拠: `src/views/CaptureView.tsx`, `ProgressionGrid`, `previewCandidate()`, `previewCandidateChord()`

- 候補内のコードラベルや保存用タイトル、Summaryを編集できる  
  根拠: `src/views/CaptureView.tsx`, `updateChordLabel()`, `parseChordLabel()`

- 候補を新規Ideaとして保存できる  
  根拠: `src/views/CaptureView.tsx`, `ProgressionSaveDialog`, `createIdeaFromDraft()`

- 候補を既存Ideaへ保存済み進行ブロックとして追加できる  
  根拠: `src/views/CaptureView.tsx`, `appendBlockToIdea()`

- 候補のSummaryを既存IdeaのChord Memoへコピーできる  
  根拠: `src/views/CaptureView.tsx`, `copyMemo()`

- 候補または保存済み進行をChord Drip向けテキスト形式でコピーできる  
  根拠: `src/domain/progressionText.ts`, `formatProgressionText()`, `src/views/CaptureView.tsx`, `src/App.tsx`

- Library一覧で、保存済み進行ブロックを持つIdeaのミニプレビューを確認できる  
  根拠: `src/App.tsx`, Library view内の `progressionBlocks` 表示

## 4. UI/画面別の変更

### Capture画面

主な実装ファイル:

- `src/views/CaptureView.tsx`
- `src/views/CaptureView.test.tsx`
- `src/views/captureLabels.ts`
- `src/views/captureLabels.test.ts`
- `src/i18n.ts`

実装内容:

- Capture画面を `src/App.tsx` から独立した `src/views/CaptureView.tsx` に分離
- 空状態にMIDI読み込み導線を表示
- 解析後は以下の構成で表示
  - 解析結果サマリ
  - Progression Candidates
  - Full Timeline details
- 候補カードで以下を表示
  - 候補番号
  - 小節範囲
  - 長さ
  - ラベル
  - Summary
  - コード進行グリッド
  - 必要な場合のみ信頼度
  - 警告の人間向けラベル
- 候補カードで以下の操作を提供
  - 試聴
  - 停止
  - 編集
  - 保存
  - Chord Drip形式コピー
- 編集時は以下を変更可能
  - 保存タイトル
  - Summary
  - 選択中コードのラベル

注意:

- `CaptureView.tsx`内の一部日本語文字列が端末表示上で文字化けして見える箇所があります。`src/i18n.ts`の追加文言自体はUTF-8で正しく入っていますが、既存の一部UI直書き文字列は整理余地があります。

### 保存モーダル

主な実装ファイル:

- `src/views/CaptureView.tsx`, `ProgressionSaveDialog`

保存方法:

- `new`: 新規Ideaとして保存
- `append`: 既存Ideaの `progressionBlocks` へ追加
- `memo`: 既存Ideaの `chordMemo` へSummaryをコピー

保存経路:

- 新規Idea: `createIdeaFromDraft()`
- 既存Ideaへ追加: `appendBlockToIdea()`
- メモコピー: `updateIdea()`

これらは既存のstore経由で実行され、repository直書きはしていません。

### Library画面

主な実装ファイル:

- `src/App.tsx`
- `src/domain/progressionText.ts`

実装内容:

- `idea.progressionBlocks ?? []` を参照
- 最初の保存済み進行ブロックをカード内に表示
- 表示する内容
  - Summaryまたは保存済み進行ラベル
  - `formatProgressionText(firstBlock.chords).split("\n")[0]` による1行プレビュー
  - 保存済みブロック数バッジ

## 5. Chord Drip連携用テキスト

主な実装ファイル:

- `src/domain/progressionText.ts`
- `src/domain/progressionText.test.ts`
- `src/views/CaptureView.tsx`
- `src/App.tsx`

実装された関数:

```ts
export function formatProgressionText(
  items: readonly ChordTimelineItem[],
  options: { barsPerLine?: number } = {},
): string {
  if (items.length === 0) return "";

  const barsPerLine = options.barsPerLine ?? 4;
  const firstBar = Math.min(...items.map((item) => item.bar));
  const lastBar = Math.max(...items.map((item) => item.bar));
  const lines: string[] = [];

  for (let lineStart = firstBar; lineStart <= lastBar; lineStart += barsPerLine) {
    const lineEnd = Math.min(lastBar, lineStart + barsPerLine - 1);
    const cells: string[] = [];

    for (let bar = lineStart; bar <= lineEnd; bar += 1) {
      cells.push(formatBar(items, bar));
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}
```

出力形式:

```text
| Cmaj7 | Am7 | Dm7 | G7 |
```

特徴:

- 小節ごとに `|` 区切り
- 同一小節に複数コードがある場合はスペース区切り
- コードが無い小節は `-`
- デフォルトは4小節ごとに改行

## 6. MIDIドラッグ&ドロップ

主な実装ファイル:

- `src/views/CaptureView.tsx`
- `src/views/CaptureView.test.tsx`
- `src/i18n.ts`

実装内容:

- Tauriデスクトップ環境では `getCurrentWebview().onDragDropEvent()` を使用
- `enter` / `over` でドロップ中UIを表示
- `leave` でドロップ中UIを解除
- `drop` で `.mid` / `.midi` のパスを探し、`readFile()` で読み込む
- ブラウザ/HTML5 DnD向けに `DataTransfer.files` から `File.arrayBuffer()` で読み込むフォールバックも実装
- `.mid` / `.midi` 以外は解析せず、トーストで案内

対象拡張子判定:

```ts
export function isMidiFileName(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}
```

注意:

- 複数ファイル同時ドロップ時は、最初に見つかったMIDIファイルのみ解析します。
- 複数MIDIをキュー処理する機能は未実装です。

## 7. 既存アーキテクチャとの関係

### domain層

Phase 2.5で追加した純粋ロジック:

- `src/domain/progressionText.ts`

特徴:

- Reactをimportしていません
- Zustandをimportしていません
- Tauri APIをimportしていません
- 入力 `ChordTimelineItem[]` からテキストを返すだけの純関数です

### UI層

主に以下へ実装しました。

- `src/views/CaptureView.tsx`
- `src/App.tsx`
- `src/ui/ProgressionGrid.tsx`

Tauri APIを触るのはUI層です。

- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/api/webview`

### store/永続化

Phase 2.5では永続化方式自体は変更していません。

- 新規Idea保存は既存の `createIdeaFromDraft()` を使用
- 既存Ideaへの進行追加は既存の `appendBlockToIdea()` を使用
- 既存Idea更新は `updateIdea()` を使用
- repository直書きはしていません
- `data.json`の保存形式やバックアップ方式には触れていません

## 8. テスト

Phase 2.5で追加/更新された主なテスト:

- `src/views/CaptureView.test.tsx`
  - 候補カードのデフォルト表示
  - 信頼度表示の丸め/表示条件
  - 保存モーダルの表示
  - 既存Idea保存時の必須選択
  - MIDI拡張子判定

- `src/domain/progressionText.test.ts`
  - Chord Drip向け進行テキスト整形
  - 複数小節/空小節/改行の挙動

- `src/views/captureLabels.test.ts`
  - 信頼度/警告ラベルの表示ロジック

最終確認で通したコマンド:

```text
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run tauri build
```

最終テスト結果:

```text
18 files passed
79 tests passed
```

生成済みexe:

```text
C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\loop-vault.exe
```

生成済みインストーラ:

```text
C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi
C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe
```

## 9. 手動確認してほしい点

Phase 2.5後にユーザー確認が必要な点:

1. Capture画面にMIDIをドロップして解析が始まるか
2. 解析結果表示中に別MIDIをドロップして差し替え解析できるか
3. `.wav`など非MIDIをドロップした時にトーストが出るか
4. 候補カードの試聴で、コードと進行ハイライトが大きくズレないか
5. 候補を新規Ideaとして保存できるか
6. 候補を既存Ideaへ追加できるか
7. Chord Drip形式コピーのテキストが実際にChord Drip側で扱いやすいか
8. Library一覧で保存済み進行のミニプレビューが邪魔にならず、必要な情報として読めるか

## 10. 既知の制約・次に直すとよさそうな点

- Capture UIは機能が増え、`src/views/CaptureView.tsx`が大きくなっています。次の大きめの改修では `ProgressionCandidateCard`、`ProgressionSaveDialog`、DnD処理を分割すると保守しやすくなります。
- 日本語UIの一部に、過去実装由来の文字化けしている直書き文字列が残っています。`src/i18n.ts`へ寄せる整理タスクを別途切るとよいです。
- 複数MIDIファイルの一括ドロップ/連続解析は未実装です。
- Chord Dripとの連携は現時点ではテキストコピーです。直接連携、ファイル連携、アプリ間連携は未実装です。
- MIDI解析結果全体は永続化せず、保存された `SavedProgressionBlock` のみ永続化する設計を維持しています。
- `formatProgressionText()` は現状コードラベル中心です。拍位置や分数表現をより厳密にChord Dripへ渡す必要が出た場合は、別フォーマットを追加する余地があります。

## 11. Claudeさんへの引き継ぎメモ

まず見るべきファイル:

- `src/views/CaptureView.tsx`
- `src/domain/progressionText.ts`
- `src/App.tsx`
- `src/ui/ProgressionGrid.tsx`
- `src/audio/chordPreview.ts`
- `src/i18n.ts`
- `src/store/vaultStore.ts`

設計上の注意:

- domain層にReact/Zustand/Tauri依存を入れない方針は維持されています。
- MIDI解析結果そのものは永続化しません。
- 永続化するのは、ユーザーが保存操作をした `SavedProgressionBlock` です。
- 新機能でSongIdeaや保存済み進行を追加する場合は、repositoryを直接触らずstoreアクション経由にしてください。
- Chord Drip連携を深める場合は、既存の `ChordSymbol` / `ChordTimelineItem` / `SavedProgressionBlock` を通貨として使うのが自然です。
