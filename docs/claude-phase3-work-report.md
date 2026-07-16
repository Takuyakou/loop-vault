# Loop Vault Phase 3 作業報告書

## 概要

Phase 3 では、既存の MIDI 解析・保存・状態遷移のドメインロジックを変更せず、日々の制作で使う画面を中心に UI/UX を刷新した。実装は PR #11 から #17 の 7 本に分割し、依存順に `master` へマージ済みである。

- 最終マージ: PR #17（2026-07-13）
- `master` のマージコミット: `933e82e`
- 最終成果物: `src-tauri/target/release/loop-vault.exe`

Phase 3 の主眼は、MIDI から見つけたコード進行を「採集する」、次に進める Loop を「選ぶ」、保存済み進行を「聴き返して再利用する」という三つの行動を、画面の主役にすることだった。

## 実装内容

### P3-01: 表示ラベルとナビゲーション基盤（PR #11）

- `src/components/AppShell.tsx` を追加し、Home / コード採集 / Vault / 新規 Idea / 設定への共通ナビゲーションを切り出した。
- `src/domain/displayLabels.ts` を追加し、ステータス、コード候補ラベル、キー表記を日本語・英語で表示する関数を用意した。
- `src/i18n.ts` のコピーを画面用に更新した。表示言語は既存の `settings.language` を利用する。

### P3-02: Home を「今日の Loop」中心へ刷新（PR #12）

- `src/App.tsx` の `HomeView()` を更新し、`pickFocus()` の選定結果を中心に表示する構成にした。
- Focus Idea に保存済みの Progression Block がある場合は、そのコード進行、BPM、キー、次のアクションを表示する。
- Focus がない場合は、コード採集・新規 Idea・Vault へ進める空状態を表示する。
- 月間完了数、パイプライン、Next Action 不足、停滞状態は既存の集計ロジックをそのまま利用している。

### P3-03: コード採集を候補中心の作業台へ刷新（PR #13）

- `src/views/CaptureView.tsx` を更新し、MIDI の解析結果をタイムラインと複数の候補カードとして扱う画面に整理した。
- `ProgressionCandidateCard()` は、候補の展開、コード編集、候補全体の試聴、個別コードの試聴、保存ダイアログ表示を担う。
- MIDI ファイルのドラッグ&ドロップ処理を維持し、`.mid` / `.midi` 判定は `isMidiFileName()` で行う。
- 候補カードには `ProgressionGrid` を常時描画する。

### P3-04: Vault に進行ビューと再利用導線を追加（PR #14）

- `src/App.tsx` の `LibraryView()` を更新し、Idea 一覧に加えて保存済み Progression Block を一覧表示するようにした。
- 各進行は親 Idea、コード列、BPM、キー、対象小節を表示し、親 Idea を開く、コード進行をコピー、試聴できる。
- `DetailView()` でも保存済み Progression Block を表示し、試聴・コピーを行える。

### P3-05: 設定とデータ管理画面を整理（PR #15）

- `SettingsDialog()` を整理し、言語、月間目標、データのエクスポート/インポート、データフォルダ表示、バックアップ復元を扱う既存機能を画面上でまとめた。
- `VaultFile.settings` に任意フィールド `showRomanNumerals?: boolean` を追加した。スキーマは `z.boolean().default(true)` のため、既存データでは表示オンとして読み込まれる（`src/domain/schema.ts`）。
- `src/domain/harmony/romanNumerals.ts` を追加し、検出キーと `ChordSymbol` からローマ数字ヒントを返す `romanNumeralHint()` を実装した。結果の信頼度は常に `medium` である。
- コード採集の候補カードでは、設定がオンのときだけローマ数字ヒントを表示する。

### P3-06: アプリシェル分割とアイコン方針（PR #16）

- 共通ヘッダーを `AppShell` として `App.tsx` から分離した。
- `src/components/Toast.tsx` を追加し、既存の Toast 表示を部品として分けた。
- アイコンの採用方針を `docs/icon-direction.md` に記録した。

### P3-07: 再生導線とヘッダー重複の修正（PR #17）

ユーザー確認で見つかった次の問題を修正した。

- コード採集で候補カードを表示し、カード内の各コードをクリックして試聴できるようにした。`CaptureView.tsx` の `ProgressionCandidateCard()` が `ProgressionGrid` の `onChordSelect` から `onPreviewChord` を呼ぶ。
- 重複していたヘッダー見出しを廃止し、上部には Loop Vault のワードマークとナビゲーションだけを残した（`src/components/AppShell.tsx`）。
- Vault の Idea カードと保存済み進行カードに再生 `▶` と停止 `■` を追加した。停止は `src/App.tsx` の `stopPreviewTimeline()` から `src/audio/chordPreview.ts` の `stopPreview()` を呼ぶ。

## 変更していない領域

Phase 3 では、以下の基盤は変更していない。

- MIDI の SMF 解析、コード推定、候補生成: `src/domain/midi/*`
- SongIdea / SavedProgressionBlock の永続化形式と `fileVersion`: `src/domain/types.ts`, `src/domain/schema.ts`
- `applyVaultChange()` と 500ms デバウンスの自動保存経路: `src/store/vaultStore.ts`
- Tauri のアトミック保存、バックアップ、破損時退避: `src/domain/repository.ts`
- ウィンドウ終了時の flush と Rust 側の `exit_app`: `src/store/closeGuard.ts`, `src-tauri/src/lib.rs`

したがって、Phase 3 の表示設定である `showRomanNumerals` 以外に、既存データの必須フィールドや `fileVersion` の変更はない。

## PR とマージ状況

| PR | タイトル | 状態 |
|---|---|---|
| #11 | P3-01: UIラベルとナビ基盤を刷新 | `master` へマージ済み |
| #12 | P3-02: Homeを今日のLoop中心に刷新 | `master` へマージ済み |
| #13 | P3-03: コード採集を候補中心の作業台に刷新 | `master` へマージ済み |
| #14 | P3-04: Vaultに進行ビューと再利用導線を追加 | `master` へマージ済み |
| #15 | P3-05: 設定とデータ管理画面を整理 | `master` へマージ済み |
| #16 | P3-06: アプリシェルを分割しアイコン方針を追加 | `master` へマージ済み |
| #17 | P3-07: 再生導線とヘッダー重複を修正 | `master` へマージ済み |

各PRは実装時には下位PRをベースに積み、最終的に #11 から #17 の順で `master` に取り込んだ。PRブランチは削除していない。

## 検証結果

2026-07-13 に最終コードで実行した結果:

- `npm.cmd run lint`: 成功
- `npm.cmd test`: 成功、20 files / 86 tests
- `npm.cmd run build`: 成功（Tauri build 内で実行）
- `npm.cmd run tauri build`: 成功

生成物:

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 既知の制約・次フェーズへの引き継ぎ

- `App.tsx` は Phase 3 後も約 1,300 行で、Home / Vault / Detail / Settings のビュー実装を多く含む。`AppShell` と `Toast` は分離済みだが、画面単位の完全な分割は未実施である。
- `romanNumeralHint()` はキー名の簡易パースとコード根音差に基づく表示補助であり、借用和音・転調・高度な機能和声の解析ではない。信頼度も現状は常に `medium`。
- Vault の再生・停止ボタンは保存済み Progression Block があるカードにのみ表示される。Idea 単体のテキストメモからは音を生成しない。
- Phase 3 で MIDI/オーディオ解析やデータモデルの追加はしていない。次の音楽機能は、解析結果を一時状態に保持し、保存時に既存の `createIdeaFromDraft()` / `appendBlockToIdea()` と `applyVaultChange()` を通す既存方針を維持できる。
- `docs/loop-vault-phase3-final-uiux-refresh-work-plan.md` と `src-tauri/gen/` はローカルの未追跡ファイルであり、この報告書のコミット対象には含めない。
