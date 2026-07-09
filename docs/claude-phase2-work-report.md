# Loop Vault Phase 2 作業報告書

## 目的

Loop Vault Phase 2 では、MIDIファイルからコード進行を解析し、再利用できる進行ブロックとして保存する機能を追加した。あわせて、作曲アプリとして触りやすくするためのUI刷新、Chord Drip由来の進行表示/試聴体験、デスクトップ終了処理の修正、UI言語切替を実装した。

この報告書は、Claudeさんへ現状を引き継ぐために「実際に入った変更」をまとめる。

## ブランチとPR

- Phase 2 本体PR: `feature-japanese-ui-audio-preview`
  - PR: https://github.com/Takuyakou/loop-vault/pull/1
  - 主なコミット:
    - `2d1fc4a P2-21: Japanese UI and chord preview`
    - `ff6d963 P2-22: Fix desktop window close guard`
    - `2b269cc P2-23: Reuse Chord Drip progression grid`
- ×ボタン終了修正PR: `fix/window-close-exit`
  - PR: https://github.com/Takuyakou/loop-vault/pull/2
  - 主なコミット:
    - `292862f Fix desktop window close flow`
    - `6da85c8 Use Rust app exit for window close`
- 言語切替PR: `feature/ui-language-toggle`
  - PR: https://github.com/Takuyakou/loop-vault/pull/3
  - 主なコミット:
    - `3561a7e Add UI language toggle`

PR #3 は PR #2 をbaseにしたスタックPR。PR #2 は PR #1 のPhase 2ブランチをbaseにしている。

## 実装サマリ

Phase 2でユーザーができるようになったこと:

- MIDIファイルを選択して解析できる
- MIDI全体のコードタイムラインを表示できる
- 4/8/16小節の候補ブロックを複数確認できる
- 候補ブロック内のコードを選択して単体試聴できる
- 候補ブロック全体をピアノ音色で試聴できる
- 候補ブロックを新規Ideaとして保存できる
- 候補ブロックを既存Ideaへ追加できる
- 候補ブロックのsummaryを既存IdeaのChord Memoへコピーできる
- 保存済み進行ブロックをDetail画面で確認/試聴/削除できる
- Chord Drip風のコードカード/進行グリッド/再生進捗表示で進行を見られる
- 日本語中心のUIで主要画面を使える
- SettingsからUIを日本語/Englishで切り替えられる
- デスクトップ版の×ボタンでアプリプロセスを終了できる

## データモデル

追加/変更した主な型:

- `ChordSymbol`
- `ChordTimelineItem`
- `ProgressionBlockCandidate`
- `MidiProgressionAnalysis`
- `SavedProgressionBlock`
- `SongIdea.progressionBlocks?: SavedProgressionBlock[]`
- `VaultFile.settings.language: "ja" | "en"`

根拠ファイル:

- `src/domain/types.ts`
- `src/domain/schema.ts`

重要な設計:

- 解析結果 `MidiProgressionAnalysis` は `data.json` に保存しない
- 永続化するのは、ユーザーが保存操作をした `SavedProgressionBlock` のみ
- `SongIdea.progressionBlocks` は zod `.default([])` で補完される
- `settings.language` は zod `.default("ja")` で補完される
- `fileVersion` は `1` のまま
- `chordDrip?: unknown` には触れていない

## MIDI解析

実装場所:

- `src/domain/midi/parser.ts`
- `src/domain/midi/analysis.ts`
- `src/domain/midi/types.ts`
- `src/domain/midi/index.ts`

実装内容:

- `@tonejs/midi` でSMFを読み込む
- 読み込み直後に自前の `TimedNote[]` へ変換する
- 解析ロジックは `TimedNote[]` ベースで動く
- コード候補は `ChordSymbol` 構造で保持する
- 解析結果には `analyzerVersion` を入れる
- 同じMIDI bytesから同じ解析結果になるよう、現在時刻や乱数には依存しない

テスト:

- `src/domain/midi/analysis.test.ts`
  - 解析の決定性
  - progression blockの候補生成

## コード表現と試聴

実装場所:

- `src/domain/chords.ts`
- `src/domain/chordVoicing.ts`
- `src/audio/chordPreview.ts`

実装内容:

- コード名は文字列だけでなく `ChordSymbol` として構造化
- コード編集時は `parseChordLabel()` で再パースする
- `ChordSymbol` からピアノ用のボイシングを作る
- `tone` を使ってピアノ系音色でコードを鳴らす
- 単体コード試聴とコードタイムライン試聴を実装

テスト:

- `src/domain/chords.test.ts`
- `src/domain/chordVoicing.test.ts`

## Capture UI

実装場所:

- `src/App.tsx`

実装内容:

- ナビにCapture/MIDI解析画面を追加
- MIDI選択ダイアログから `.mid/.midi` を読み込み
- 解析後にメトリックを表示
  - ファイル名
  - 小節数
  - BPM
  - 拍子
- Full Timelineを表示
- Candidate Blocksを表示
- 候補ごとに以下を操作可能
  - summary編集
  - コード選択
  - コードラベル編集
  - 選択コード試聴
  - 全体試聴
  - 新規Idea保存
  - 既存Ideaへ追加
  - メモへコピー

保存経路:

- 新規Idea: `createIdeaFromDraft(draft)`
- 既存Ideaへ追加: `appendBlockToIdea(ideaId, block, analysis)`
- どちらも `applyVaultChange()` 経由で既存autosaveに乗る
- repositoryへの直書きはしていない

根拠ファイル:

- `src/store/vaultStore.ts`
- `src/App.tsx`

## Chord Drip資産の流用

参照元:

- `D:\dev\Chord Drip作成\src\ui\ProgressionGrid.tsx`
- `D:\dev\Chord Drip作成\src\ui\playbackProgress.ts`

Loop Vault側の実装:

- `src/ui/ProgressionGrid.tsx`
- `src/ui/playbackProgress.ts`

実装内容:

- Chord Dripのコードカード/進行表示の考え方をLoop Vaultの `ChordTimelineItem[]` に合わせて移植
- 小節単位のグリッドでコード進行を表示
- 選択中コード、再生中コード、再生進捗バーを表示
- 候補ブロックと保存済みブロックの両方で利用
- 再生中の進行に合わせて、視覚的な進捗が動く

テスト:

- `src/ui/ProgressionGrid.test.tsx`
- `src/ui/playbackProgress.test.ts`

## UI刷新と日本語/英語切替

実装場所:

- `src/App.tsx`
- `src/i18n.ts`

実装内容:

- Phase 2中に日本語中心のUIへ調整
- Settings画面から `日本語` / `English` を切り替え可能にした
- 選択言語は `settings.language` に保存
- 切替は即時反映
- 言語切替は既存のautosave対象

対象にした主要UI:

- ナビ
- 保存状態
- Settings
- Home
- Library
- Capture
- Detail
- Create dialog
- Startup/Empty state
- 主要toast文言

対象外:

- Idea名
- ユーザーメモ
- MIDI由来のコード名
- BPM/Key/Genre/Moodなどの音楽メタデータ
- OS/ブラウザ由来の文言
- 一部の細かい確認文

データ互換:

- `settings.language` が無い旧data.jsonは `ja` として読み込む
- `fileVersion` は `1` のまま

テスト:

- `src/domain/schema.test.ts`
  - legacy settingsに `language` が無い場合 `ja` になる
- `src/store/vaultStore.test.ts`
  - `setLanguage("en")` がstoreと保存対象vaultへ反映される

## ×ボタン終了修正

実装場所:

- `src/store/closeGuard.ts`
- `src-tauri/src/lib.rs`

発生していた問題:

- exe起動時、ウィンドウ右上の×を押してもアプリが終了しない
- タスクマネージャーやターミナル停止でしか落とせない状態だった

最終的な修正:

- Tauri実行時はブラウザ用 `beforeunload` guardを登録しない
- TauriのcloseイベントはJS listenerが存在するだけでネイティブcloseを止めるため、JS側で必ず `event.preventDefault()` する
- 未保存変更があれば `flush()`
- 保存できたらRustコマンド `exit_app` を呼ぶ
- Rust側で `app.exit(0)` を実行し、アプリプロセス自体を終了する

結果:

- ユーザー環境で「何も編集せず×」により閉じられることを確認済み

テスト:

- `src/store/closeGuard.test.ts`

## 永続化と後方互換

今回守った点:

- 既存の `applyVaultChange()` → autosave経路を使う
- repository直書きはしない
- `data.json` の `fileVersion` は上げない
- 新フィールドはzod defaultで後方互換にする
- 解析結果全体は保存しない
- 保存された進行ブロックだけ `SongIdea.progressionBlocks` に残す

関係ファイル:

- `src/domain/schema.ts`
- `src/domain/repository.ts`
- `src/store/vaultStore.ts`

## 依存関係

Phase 2で主に使った外部依存:

- `@tonejs/midi`
  - MIDIパースに使用
- `tone`
  - コード試聴に使用

関係ファイル:

- `package.json`
- `package-lock.json`

## テストと検証

最終確認で実行済み:

- `npm.cmd run lint`: passed
- `npm.cmd test`: passed
  - 15 files
  - 67 tests
- `npm.cmd run build`: passed
- `npm.cmd run tauri build`: passed

生成済みexe:

- `C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\loop-vault.exe`

生成済みinstaller:

- `C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `C:\Users\fdfff\Documents\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 既知の制約

- MIDI解析は候補と信頼度を出す設計であり、唯一の正解コード進行を保証するものではない
- 解析結果全体は永続化しないため、アプリ再起動後に同じ解析画面を復元する機能はない
- UIはまだ `src/App.tsx` に大きくまとまっている
- i18nは `src/i18n.ts` とprops受け渡しで実装しており、React context化は未実施
- MIDI/オーディオからの高度なコード検出、録音、リアルタイム解析は未実装
- `chordDrip?: unknown` は未使用のまま
- Chord Dripとの完全な双方向連携は未実装。今回はUI/再生進捗/コード表示の資産流用まで

## Claudeさんへの申し送り

次に触るなら、最初に見るべきファイル:

- `src/domain/types.ts`
- `src/domain/schema.ts`
- `src/domain/midi/analysis.ts`
- `src/store/vaultStore.ts`
- `src/App.tsx`
- `src/i18n.ts`
- `src/ui/ProgressionGrid.tsx`
- `src/audio/chordPreview.ts`

設計上の注意:

- `src/domain/*` はReact/Zustand/Tauriに依存させない
- MIDI解析結果全体はstoreの一時状態に置き、保存するのは `SavedProgressionBlock` のみ
- 新しい保存系機能は `applyVaultChange()` を通す
- 旧data.json互換を壊さない
- `fileVersion` を上げる必要が出た場合は、migration方針を先に決める
- Chord Drip連携を深める場合は、既存の `ChordSymbol` / `SavedProgressionBlock` を通貨にするのが自然
