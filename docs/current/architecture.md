# アーキテクチャ(v3.2.0)

## フォルダの役割

Loop Vault は Tauri v2 のデスクトップアプリです。画面の切り替えは `src/App.tsx` の `AppView` で行い、ネイティブ側は `src-tauri/` にあります(`src/components/AppShell.tsx:28-35`)。Live MIDI のミニウィンドウだけは別の WebView です(`src/main.tsx:10-22`)。

- **`src/domain/`** — 計算の本体。コード名の解釈と表記(`chords.ts`、`chordIdentity.ts`)、MIDI の解析(`midi/`)、テキストの取り込み(`textProgression.ts`、`textNormalize.ts`、`txtJazzParser*`)、ボイシング(`voicing/`、`voicingRules/`、`voicingShapes/`、`voicingPractice/`)、進行の編集・分類・練習(`progressionEditing/`、`progressionClassification/`、`progressionVoicingPractice/`、`practice/`)、保存形式(`repository.ts`、`schema.ts`、`types.ts`)。React と Tone の import は 0 件で、入出力はプレーンなデータです。Chord Dojo と Ear Practice の記録のように、保存アダプタを domain の中に持つ所もあります(`chordDojo/storage.ts`、`earPractice/earRecordRepository.ts`)。
- **`src/views/`** — 画面。`HomeView.tsx`、`CaptureView.tsx`、`VaultView.tsx`、`DetailView.tsx`、`ProgressionDetailView.tsx`、`SettingsView.tsx`、`ProgressionVoicingPracticeView.tsx` と、`chord-dojo/`、`ear-practice/`、`capture/`、`home/`、`vault/`、`voicing-loop/` の各画面。Vault に関わる画面は、`src/App.tsx` が購読した状態と操作を props で受け取ります(`src/App.tsx:952-1220`)。画面専用のフックと描画部品も同じフォルダに置きます(`home/timelinePlayhead.ts`、`vault/vaultLibrary.ts`)。
- **`src/audio/`** — 音を鳴らす所。`chordPreview.ts`(`Tone.Sampler` のピアノと `Tone.PolySynth` の電気ピアノ、コード・進行・音符のプレビュー)、`playbackController.ts`(同時に 1 つだけ鳴らす)、`textTransport.ts`(テキストの再生位置)、`masterVolume.ts`、`outputFade.ts`、`metronomePreference.ts`、`globalBpmPreference.ts`、`previewSoundPreference.ts`(音量と設定)。
- **`src/practice/`** — 練習の時計。`ProgressionVoicingTransport.ts`(Voicing Loop と Chord Dojo のガイド練習が使う `Tone.Transport` の実装。旧版と `ProgressionVoicingTransportV2`)、`PracticeClock.ts`(小節・拍の開閉を予約する部品。今はテストだけが参照しています)。
- **`src/store/`** — Vault の状態。`vaultStore.ts`(zustand。変更 → 500 ms の debounce → `flush` → `repository.save`)、`defaultVaultStore.ts`(Tauri とブラウザで保存先を選ぶ)、`closeGuard.ts`(閉じる前に保存する)、`closePreparation.ts`・`closeBlocker.ts`(編集中の画面が閉じるのを止める)。
- **`src/storage/`** — `VaultStorage` の実装。`tauriVaultStorage.ts`(`@tauri-apps/plugin-fs`)、`jazzVaultStorage.ts`(保存先を `loopvault/txt-jazz-v3/` にし、旧 `loopvault/data.json` を一度だけ移す)、`browserMemoryVaultStorage.ts`(ブラウザ開発用のメモリ)、機能ごとの設定(`accuracyFirstSettings.ts` など)。
- **`src/components/`** — 画面をまたぐ部品。`AppShell.tsx`(サイドバーと上部)、`PlayToggle.tsx`、`Modal.tsx`、`CommandPalette.tsx`、`LiveMidi*`、`capture/`、`correction-workspace/`、`pre-analysis/`、`progression-editing/`、`practice/`、`music-keyboard/`、`timeline/`、`voicing/`、`shell/`、`ui/`、`notifications/`。
- **`src/features/`** — `bass-practice/`(Bass Practice 一式。`domain/`・`application/`・`infra/`・`midi/`・`recording/`・`stage/`・`ui/`)と `command-palette/`(`paletteModel.ts`)。Bass Practice は `BassPracticeModeView` を `App.tsx` が遅延読み込みし(`src/App.tsx:133-136`)、ON/OFF は `application/featureFlag.ts`(既定は有効、localStorage の `false` で戻せる)。
- **その他の `src/` 直下** — `liveMidi/`(MIDI 入力の接続と Live MIDI の状態)、`voicingPractice/`(Voicing Loop の運指と設定)、`midiExport/`(進行の MIDI 書き出しとネイティブドラッグ)、`courseDesign/`(Guided Course の教材。`docs/contracts/p23-39/` と対)、`security/`(取り込みの上限 `intakeBudgets.ts`)、`testing/`(E2E 用の合成データ)、`ui/`(進行グリッドとモーション)、`hooks/`(画面をまたぐ小さなフック)、`llm/`(以前の AI 設定のためのコードのうち、残っている物。`preferences.ts` と、API キーの状態確認・削除だけの `bridge.ts`。生成や送信の処理はありません)。
- **`src-tauri/`** — Rust。`src/lib.rs` がコマンドを登録し、`main.rs` は `run()` を呼ぶだけです。`practice_storage.rs`(練習記録)、`chord_dojo_storage.rs`(Chord Dojo の記録)、`midi_export.rs`・`native_drag.rs`(MIDI の書き出しとドラッグ)、`live_midi/`(MIDI 入力の list/open/close)、`media_permission.rs`(録音のマイク許可)、`llm/keychain.rs`(API キーの状態確認と削除)。設定は `tauri.conf.json` と `capabilities/default.json` にあります。
- **`e2e/`** — Playwright。`playwright.config.ts` が `npm run preview` を `127.0.0.1:4174` で起動し、Chromium で `e2e/*.spec.ts` を回します。Tauri ではなくブラウザで動くので、Vault は `BrowserMemoryVaultStorage`、ネイティブのコマンドは呼ばれません。共通操作は `e2e/helpers/` にあります。
- **`scripts/`** — 開発用のコマンド。`test-dx/`(テストの段階分け)、`phase-docs/`(フェーズ文書の検査)、`ai-handoff/`(引き継ぎ文書の検査)、`security/`(追跡ファイルの検査)、`playwright-web-server.js` ほか。`scripts/archive/` は評価・監査・調整用で、`package.json` のコマンドからは外れています(`scripts/archive/README.md`)。

docs は役割で分かれています。過去の記録は `docs/archive/`、テストとアプリが読む凍結データは `docs/contracts/` です(`docs/README.md`)。

## 純粋な層と画面の分け方

計算は `src/domain/`、Vault の状態は `src/store/`、表示は `src/views/` と `src/components/`、音は `src/audio/` と `src/practice/` に置きます。この向きを崩さないのが、変更時の基本です。

- 計算は domain の関数に書きます。時計の状態は `reduceProgressionPracticeClock` がデータで受け取ってデータで返し、`projectProgressionPracticeClock` が表示用の値にします(`src/domain/progressionVoicingPractice/clock.ts:90-179`)。`buildPracticeClockSchedule` も同じ形の純粋な関数です(`src/practice/PracticeClock.ts:34-66`)。
- domain は React も Tone も import しません(現在 0 件)。保存の境界は `VaultStorage` インターフェースで、実装は `src/storage/` にあります(`src/domain/repository.ts:48-61`)。domain の本体(テスト以外)は storage や store を値として import しません(型だけの参照はあります。`src/domain/preAnalysisParts/applyMemory.ts:2`)。
- Vault の状態を購読するのは `App.tsx` だけです(`src/App.tsx:208-237`)。画面は props で状態と操作を受け取り、Vault の store を直接読み書きしません。画面の中の一時的な状態は `useState` に置きます。
- 例外は Live MIDI と Chord Dojo の記録です。たとえば、これらの小さな store は、その画面が `useStore` で直接購読します(`src/views/chord-dojo/ChordDojoView.tsx:85-86`、`src/liveMidi/defaultLiveMidiStore.ts`)。
- ふだんの試聴は `playbackController.play({ kind, id }, request)` を通します。`PlayingSource` の `kind` と `id` で「今鳴っているのは誰か」を 1 つに保ち、別の再生が始まると前の再生を止めます(`src/audio/playbackController.ts:14-58, 145-182`)。画面は `usePlaybackState()` で状態だけ購読します(`src/hooks/usePlaybackState.ts`)。
- 複数の画面で使う部品だけ `src/components/` に置きます。1 つの画面でしか使わないフックと部品は、その画面のフォルダ(`views/home/`、`views/vault/`、`views/chord-dojo/`)に置きます。
- テストは対象の隣に `.test.ts(x)` で置きます。凍結した正解の表は `docs/contracts/` に置き、テストが読みます(`src/domain/voicingShapes/golden.test.ts` は `docs/contracts/voicing-shapes-p26/golden.json` を読む)。表を変える時はテストと一緒に変えます。
- 画面を足す時は `AppView` に値を足し、`App.tsx` の分岐と `AppShell` のナビを直します(`src/components/AppShell.tsx:28-35`、`src/App.tsx:952-1220`)。「練習」の 3 画面のように、1 つの `view` の中で `practiceMode` により切り替える形もあります(`src/App.tsx:268`、`src/App.tsx:1094-1220`)。

## 音の時計(Tone.Transport)と描画

音楽の時間は Tone.js の時計が持ち、画面はその時間を読んで描きます。予約した音と再生ヘッドが同じ時刻を指すようにするのが目的です。

- Voicing Loop の実行時は `Tone.getTransport()` を 1 つだけ使い、`ProgressionVoicingTransport` がその上に予約を置きます。実装のコメントにも、Tone.Transport を唯一の音楽時計として扱うと書いています(`src/practice/ProgressionVoicingTransport.ts:73-78`)。Chord Dojo のガイド練習も同じ実装を使います(`src/views/chord-dojo/tempo.ts:18-20` が `new ProgressionVoicingTransport(true)`)。
- `ProgressionVoicingTransport` は 64 分音符ごとに `onTransportBeat(absoluteBeat, audioTime)` を呼びます(`src/practice/ProgressionVoicingTransport.ts:302-312`)。画面はこの組を ref に残し、`SYNC_TRANSPORT` として純粋な reducer に渡して現在位置を更新します(表示するカードは `projectProgressionPracticeClock` が決めます。`src/views/ProgressionVoicingPracticeView.tsx:1090-1108`、`src/domain/progressionVoicingPractice/clock.ts:102-112, 149-179`)。
- 再生ヘッドは React の再描画では動かしません。`requestAnimationFrame` の中で、最後の (拍, 音の時刻) の組を `Tone.getContext().getOutputTimestamp()` の `contextTime` と `outputLatency` で前へ補間し(最大 0.25 拍)、`style.transform` を直接書きます(`src/views/ProgressionVoicingPracticeView.tsx:884-931`)。毎フレームの位置は style に書き、カードの index だけ値が変わった時に state にする画面もあります(`src/views/chord-dojo/JazzPracticeView.tsx:233-250`)。
- クリックや対象の開閉は `Tone.getDraw().schedule` で音の時刻に合わせて UI 側へ渡します(`src/practice/PracticeClock.ts:100-140`、`src/features/bass-practice/application/rhythmMetronome.ts:29-35`)。`PracticeClock` は先に `buildPracticeClockSchedule` で予定を組み立て、その結果を Transport に予約します(`src/practice/PracticeClock.ts:34-66, 88-140`)。
- テキストの再生は `performance.now()` を基準にした `TextTransport` です(`src/audio/textTransport.ts:37-120`)。`useTextScorePlayhead` は rAF で `transport.position()` を読み、小節・帯・線の `dataset` と `style.left` を直接更新します。毎フレームの描画で React は再描画しません(`src/components/capture/useTextScorePlayhead.ts:29-69`)。
- ホームのコード帯は 100 ms の `setInterval` で `timelineIndexAt` を引き直し、値が変わった時だけ再描画されます(`src/views/home/timelinePlayhead.ts:39-48`)。`LoopRoll` は rAF で `translateX` を書きます(`src/views/home/LoopRoll.tsx:73-91`)。
- 2-5-1 Master のクリックは `Tone.Clock` を使います(8 拍で止まる短い時計。`src/views/chord-dojo/master251Clock.ts:5-11`)。
- `playbackController.stop` は世代を進め、遅れて来たコールバックを捨てます(`src/audio/playbackController.ts:141-152`)。`prefers-reduced-motion` の時は rAF を使わない所があります(`src/views/home/LoopRoll.tsx:70-76`、`src/views/ProgressionVoicingPracticeView.tsx:861-874`)。

## 保存の流れ(Vault → Rust → ファイル)

Vault の保存は、Rust の自前コマンドではなく Tauri の fs プラグインを通ります。保存にネイティブのコマンドを使うのは練習記録と Chord Dojo です。流れは次のとおりです。

画面 → `vaultStore` → `JazzVaultRepository` → `TauriVaultStorage` → `@tauri-apps/plugin-fs` → AppData の `loopvault/txt-jazz-v3/data.json`

1. 画面の操作は `App.tsx` から `vaultStore` の関数を呼びます。変更は `applyVaultChange` を通り、16 MiB の上限(`assertVaultCandidateSerializedBudget`)を確かめてから state に入り、500 ms の debounce で `flush()` が走ります(`src/store/vaultStore.ts:227-253, 276-388, 928-976`)。
2. `flush()` は `repository.save(vault)` を呼びます。`repository` は `defaultVaultStore` が選びます。Tauri なら `TauriVaultStorage`、ブラウザなら `BrowserMemoryVaultStorage` です(`src/store/defaultVaultStore.ts:10-14`)。
3. `JazzVaultRepository` は `loopvault/…` のパスを `loopvault/txt-jazz-v3/…` に付け替えます(`src/storage/jazzVaultStorage.ts:81-85`)。初回だけ旧 `loopvault/data.json`(v1 または v2 の時だけ)を読み、`legacy-import.json` にバイトそのままの写しを残してから `data.json` を作ります(`src/storage/jazzVaultStorage.ts:48-79`)。設定画面が表示する保存先もこの 1 段下のパスです(`src/views/SettingsView.tsx:168-175`)。
4. `JsonVaultRepository.save` は `serializeVault` で JSON を作り、`data.json.tmp` に書いてから `rename` で `data.json` に置き換えます(`src/domain/repository.ts:141-146`)。読み込み時は `data-YYYYMMDD-HHMM.json` の控えを `backups/` に 1 つ作り、20 個を超えた古い物を消します(`src/domain/repository.ts:240-266`)。初回起動時は空の Vault を作って保存します(`src/domain/repository.ts:99-110`)。
5. 実際の書き込みは `@tauri-apps/plugin-fs` の `writeTextFile`・`rename`・`copyFile` を `BaseDirectory.AppData` で呼びます(`src/storage/tauriVaultStorage.ts:25-79`)。許可は `src-tauri/capabilities/default.json` の `fs:scope`(`$APPDATA/loopvault/**` と `$APPDATA/com.takuyakou.loopvault/**`)にあります。Rust 側は `lib.rs` で `tauri_plugin_fs::init()` を登録するだけです(`src-tauri/src/lib.rs:30`)。
6. 保存形式の境界は v2 です。メモリ上の `VaultFile` は `fileVersion: 2` 固定で(`src/domain/types.ts:237-242`)、`vaultFileSchema` も 2 だけを受け付けます(`src/domain/schema.ts:370-377`)。読み込みは外側の封筒だけ 1・2・3 を受け、中身を常に v2 に正規化します(`src/domain/schema.ts:379-386, 419-489`)。書き出しは `canonicalVaultJson` が基本 v2 で、`altered: true` の記号を 1 つでも含む時だけ v3 の封筒にします。古い版が記録を部分的に取り込んで壊さないためです(`src/domain/repository.ts:315-326`)。
7. ネイティブの保存コマンドは Vault ではなく、練習記録と Chord Dojo にあります。`practice_storage.rs` の `load_practice_file`・`save_practice_file`・`quarantine_practice_file` など(`src-tauri/src/lib.rs:44-50`)と、`chord_dojo_storage.rs` の `load_chord_dojo_file` など(`src-tauri/src/lib.rs:51-59`)です。どちらも `app_data_dir()/loopvault` の下に、`practice-v1.json` などの名前空間ごとのファイルと、`theme-lessons-txt-jazz-v4/chord-dojo-v1.json` を置きます(`src-tauri/src/practice_storage.rs:12-21, 247-292`、`src-tauri/src/chord_dojo_storage.rs:12-22, 238-246, 290-300`)。
8. 終了時は `closeGuard` が `flush()` を最大 2 回試し、未保存が残るなら閉じません。保存できたら `exit_app` を呼びます(`src/store/closeGuard.ts:11, 124-133, 158-161`、`src-tauri/src/lib.rs:11-14`)。
9. 書き出しと読み込みは設定画面のダイアログから行います。`exportTo` は外のパスへ書き、`importFrom` は `replace` と `merge` を選べます(`src/views/SettingsView.tsx:214-246`、`src/domain/repository.ts:148-180`)。
