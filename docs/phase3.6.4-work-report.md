# Loop Vault Phase 3.6.4 作業報告書

作成日: 2026-07-16

対象: `fix/p3-6-3-timeline-play-toggle` の上に積んだ Phase 3.6.4 PR #67〜#82

実装の正: この報告書作成時点の `feature/p3-6-4-15-song-minimap` と、その上の最終QAブランチ

## 1. 結論

Phase 3.6.4「UX Reliability & Flow Polish」の実装は、計画書の Stage 1A〜4E まで完了した。主な成果は、Hold・没理由の永続化、共通Modal、アプリ全体で単一の再生制御、削除Undo、保存導線と保存規約の統一、中幅Inspector、ステータスUI、Vault・設定・ヘッダー・Homeの再構成、日英UI用語の統一、Lucideアイコン、全曲ミニマップである。

永続化は既存の `applyVaultChange()` とautosave経路を維持し、MIDI解析アルゴリズム、`defaultAnalyzerMode`、`fileVersion: 1`、`chordDrip?: unknown`、atomic write・20世代backupには変更を加えていない（`src/store/vaultStore.ts`, `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/repository.ts`）。

最終検証では `lint`、66テストファイル・380テスト、TypeScript/Vite build、Tauri buildが成功した。1280 / 1279 / 960 / 768pxで主要画面を確認し、横スクロール、画面外へ出る操作、ブラウザconsole errorは検出されなかった。

## 2. PR・コミット構成

1タスク1ブランチ1PRで、すべて直前のPRブランチをbaseにしたstacked PRである。2026-07-16時点では未マージであり、下から順番にマージする必要がある。

| 順 | PR | Branch | Base | Commit | 内容 |
|---:|---:|---|---|---|---|
| 0 | #67 | `docs/p3-6-4-plan` | `fix/p3-6-3-timeline-play-toggle` | `dba2b3a` | Phase 3.6.4計画書 |
| 1 | #68 | `feature/p3-6-4-01-hold-reason-tailwind` | `docs/p3-6-4-plan` | `15b2d7c` | Hold理由保存・Tailwind検査 |
| 2 | #69 | `feature/p3-6-4-02-common-modal` | `feature/p3-6-4-01-hold-reason-tailwind` | `a902231` | 共通Modal・確認導線 |
| 3 | #70 | `feature/p3-6-4-03-playback-controller` | `feature/p3-6-4-02-common-modal` | `91e76bf` | 共通再生制御 |
| 4 | #71 | `feature/p3-6-4-04-generic-undo` | `feature/p3-6-4-03-playback-controller` | `28b92eb` | 汎用Undo |
| 5 | #72 | `feature/p3-6-4-05-save-cta` | `feature/p3-6-4-04-generic-undo` | `f79417a` | 保存CTA一本化 |
| 6 | #73 | `feature/p3-6-4-06-responsive-inspector` | `feature/p3-6-4-05-save-cta` | `ca9bbba` | Inspectorレスポンシブ化 |
| 7 | #74 | `feature/p3-6-4-07-status-ui` | `feature/p3-6-4-06-responsive-inspector` | `cbe1e84` | ステータスUI |
| 8 | #75 | `feature/p3-6-4-08-save-policy` | `feature/p3-6-4-07-status-ui` | `406b703` | フィールド保存規約 |
| 9 | #76 | `feature/p3-6-4-09-vault-open` | `feature/p3-6-4-08-save-policy` | `3f60054` | Vaultの開く操作 |
| 10 | #77 | `feature/p3-6-4-10-settings-sections` | `feature/p3-6-4-09-vault-open` | `8b16c94` | 設定画面再構成 |
| 11 | #78 | `feature/p3-6-4-11-header-status` | `feature/p3-6-4-10-settings-sections` | `3812362` | ヘッダー状態表示 |
| 12 | #79 | `feature/p3-6-4-12-i18n-terms` | `feature/p3-6-4-11-header-status` | `7c24d66` | UI用語・日英文言 |
| 13 | #80 | `feature/p3-6-4-13-icon-system` | `feature/p3-6-4-12-i18n-terms` | `83799f5` | Lucideアイコン |
| 14 | #81 | `feature/p3-6-4-14-home-hierarchy` | `feature/p3-6-4-13-icon-system` | `2569770` | Home視覚階層 |
| 15 | #82 | `feature/p3-6-4-15-song-minimap` | `feature/p3-6-4-14-home-hierarchy` | `8b2faed` | 全曲ミニマップ |

変更規模は計画書を含め68ファイル、10,746行追加、1,141行削除である。

## 3. 実装内容

### 3.1 Hold・没理由とステータス履歴

`StatusHistoryEntry` に任意の `reason?: string` を追加した。Zodでは500文字以内、`hold` / `abandoned` 以外に理由が付くデータを拒否する。旧データの `reason` なし履歴は引き続きparseでき、`fileVersion` は1のままである（`src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/schema.test.ts`）。

```ts
export interface StatusHistoryEntry {
  status: Status;
  at: string;
  reason?: string;
}
```

Hold・没への移動時は共通Modalで任意理由を入力し、memoではなく `statusHistory` に保存する。復帰時は `prevStatus` を使う（`src/domain/transition.ts`, `src/components/StatusActionMenu.tsx`, `src/views/DetailView.tsx`）。保存しない `window.prompt()` は残していない。

### 3.2 共通Modalと破壊操作

`Modal` はportal、`role="dialog"`、`aria-modal`、Esc close、Tab/Shift+Tabのfocus trap、初期focus、close後のfocus restoreを提供する（`src/components/Modal.tsx`）。`ConfirmDialog` は重大操作の確認に同じ基盤を使う（`src/components/ConfirmDialog.tsx`）。

Create Idea、Settings、Hold・没理由、全置換import、backup restore、解析データ削除などを共通Modalへ寄せた。軽い削除は確認ModalではなくUndo対象にした（`src/App.tsx`, `src/views/SettingsDialog.tsx`, `src/views/DetailView.tsx`）。

### 3.3 アプリ全体で単一の再生制御

`playbackController` が再生source、状態、完了、停止、subscriberを一元管理する。別sourceを再生すると既存再生を止め、同時再生を1件に制限する（`src/audio/playbackController.ts`）。

```ts
export interface PlaybackController {
  getState(): PlaybackState;
  play(source: PlayingSource, request: PlaybackRequest): Promise<void>;
  stop(): void;
  subscribe(listener: () => void): () => void;
  isPlaying(source: PlayingSource): boolean;
}
```

全コード進行の再生操作は `PlayToggle` へ統一し、再生中はStopへ変わる。ヘッダーにもアプリ全体の停止操作を表示する（`src/components/PlayToggle.tsx`, `src/components/AppShell.tsx`, `src/views/CaptureView.tsx`, `src/views/VaultView.tsx`, `src/views/HomeView.tsx`, `src/views/DetailView.tsx`）。

### 3.4 汎用Undo

`useUndoQueue()` と `UndoToast` を追加し、Idea、保存進行、参考曲、関連ファイルの削除を一定時間取り消せるようにした。タイムアウト後にcommitし、対象が再作成・置換された場合の衝突も扱う（`src/hooks/useUndoQueue.ts`, `src/components/UndoToast.tsx`, `src/domain/undoDeletion.ts`, `src/App.tsx`, `src/views/DetailView.tsx`）。

### 3.5 コード採集の保存・Inspector・ミニマップ

候補ごとの保存操作を `SaveProgressionPopover` に集約し、保存CTAを1系統にした。新規Idea、既存Ideaへの追記、保存メタデータを同じ導線で扱う（`src/components/SaveProgressionPopover.tsx`, `src/views/CaptureView.tsx`）。

コードInspectorは広い画面では横、1280px未満では下部sticky領域に置く。選択コードとdirty guard、original/current編集モデルは維持した（`src/components/progression-editing/ChordInspector.tsx`, `src/views/CaptureView.tsx`, `src/styles.css`）。

`SongMiniMap` は候補の開始・終了小節を曲全体の割合へ変換し、重なる範囲を別laneへ配置する。候補クリックは既存dirty guardを通過し、全曲タイムラインを開いて開始小節へscrollする。空解析・0小節も安全に扱う（`src/components/SongMiniMap.tsx`, `src/views/CaptureView.tsx`, `src/ui/ProgressionGrid.tsx`）。解析結果・候補型と解析アルゴリズム自体は変更していない。

### 3.6 保存規約

`useDraftSave()` により、短い単一行フィールドはblur、長文は明示保存または規定操作、数値はparse・範囲検証後に保存する。Ctrl+EnterとIME compositionを区別し、変換中に保存やショートカットを誤発火させない（`src/hooks/useDraftSave.ts`, `src/views/DetailView.tsx`, `src/views/DetailView.save-policy.test.tsx`）。

保存経路は既存store actionから `applyVaultChange()` を通る。UIからrepositoryへの直接書込は追加していない（`src/store/vaultStore.ts`, `src/App.tsx`, `src/views/DetailView.tsx`）。

### 3.7 Vault・Settings・Header・Home

- Vault: 各行に明示的な「開く」操作を追加。Enter、double-clickも同じopen経路を使い、中幅では列を間引く（`src/views/VaultView.tsx`）。
- Settings: 「一般」「データ」「解析（開発用）」へ再構成。日英切替、月間目標、度数表示、import/export、backup/restore、解析評価の既存機能を保持（`src/views/SettingsDialog.tsx`）。
- Header: Home / コード採集 / Vault、`+ Idea`、再生中の停止、保存状態、設定を一列に整理。`SaveStatus` は `saved | saving | unsaved`（`src/components/AppShell.tsx`, `src/App.tsx`）。
- Home: 「今日のLoop」を主役にし、月間進捗・次の一手なし・停滞を1行へ圧縮。最近の保存進行は最大3件で試聴可能（`src/views/HomeView.tsx`）。

### 3.8 i18nとアイコン

画面文言は `src/i18n.ts` の `AppCopy` に集約し、日本語では「コード採集」「Vault」「進行」「Idea」「次の一手」を基準語にした。日本語・Englishの両方で主要画面とエラー・aria-label・tooltipを切り替える（`src/i18n.ts`, `src/i18n.test.ts`）。

操作アイコンは `lucide-react` に統一した。Play/Stop、Copy、Favorite、Open、Settings、Delete、Undo/Redo、Save、More、Warningなどに使用し、独自SVGや文字記号の増殖を抑えた（`package.json`, `src/components/iconSystem.test.ts`）。アプリアイコン `loop-vault-icon.svg` は既存資産を継続使用する。

## 4. データ・永続化への影響

永続化データで追加したのは `StatusHistoryEntry.reason?: string` のみである。optionalのため旧 `data.json` をそのまま読める。`fileVersion` は1から変更していない（`src/domain/types.ts`, `src/domain/schema.ts`）。

以下は変更していない。

- MIDI解析結果は一時state、保存を選んだ進行だけ `SavedProgressionBlock` に保存
- `chordDrip?: unknown`
- `defaultAnalyzerMode`
- repositoryのtmp→rename atomic write
- 20世代backup
- 破損時の退避・復旧経路

UndoはUI上で削除を遅延commitするが、最終commit時のデータ変更はstore actionと `applyVaultChange()` を通る（`src/hooks/useUndoQueue.ts`, `src/store/vaultStore.ts`）。

## 5. テストとQA

### 5.1 自動検証

| コマンド | 結果 |
|---|---|
| `npm run lint` | 成功。ESLintとCSS-variable Tailwind class検査成功 |
| `npm test -- --run` | 成功。66 files / 380 tests passed |
| `npm run build` | 成功。TypeScript + Vite production build |
| `npm run eval:real-midi` | 実行成功。ただしGold / Silver / Bronzeは0 / 0 / 0 |
| `npm run eval:midi:datasets` | 成功。ラベル付きsynthetic corpus 100件 |
| `npm run tauri build` | 成功。exe / MSI / NSISを生成 |
| `git diff --check` | Stage 4E時点で成功。最終報告書commit前にも再実行 |

コーパス100件の評価値:

| Metric | Legacy | Reranker |
|---|---:|---:|
| Root | 57.76% | 57.97% |
| Quality | 60.83% | 61.48% |
| Exact | 13.69% | 13.79% |
| Top-3 | 19.67% | 21.55% |
| Corrections | 918 | 917 |

### 5.2 重点テスト範囲

- Hold・没理由、旧status history parse、復帰（`src/domain/transition.test.ts`, `src/domain/schema.test.ts`）
- Modal Esc / trap / restore / aria（`src/components/Modal.test.tsx`）
- 同時再生1件、source切替、完了、削除・ヘッダー停止（`src/audio/playbackController.test.ts`, `src/components/AppShell.test.tsx`）
- Idea / progression / reference / asset Undo、timeout commit（`src/hooks/useUndoQueue.test.tsx`, `src/domain/undoDeletion.test.ts`, `src/App.test.ts`）
- 保存popover、Ctrl+Enter、IME、保存規約（`src/views/CaptureView.test.tsx`, `src/views/DetailView.save-policy.test.tsx`）
- Status current / next / hold / restore（`src/components/StatusPipeline.test.tsx`, `src/components/StatusActionMenu.test.tsx`）
- Vault open / Enter / double-click（`src/views/VaultView.test.tsx`）
- Settings sections・日英切替（`src/views/SettingsDialog.test.tsx`, `src/i18n.test.ts`）
- minimap range / lane / click / dirty guard / scroll（`src/components/SongMiniMap.test.tsx`, `src/views/CaptureView.test.tsx`, `src/ui/ProgressionGrid.test.tsx`）
- Home視覚階層（`src/views/HomeView.test.tsx`）
- real MIDI評価・修正ログ回帰（`src/domain/midi/realEvaluation/*.test.ts`）

### 5.3 手動・ブラウザQA

1280、1279、960、768pxでHome、コード採集、Vault、Idea詳細、Settingsを確認した。

- 横方向overflow: なし
- 画面外へ出る操作: なし
- 主要テキストの不自然なclip: なし
- 日本語 / English切替: 成功
- SettingsのEsc close / focus restore: 成功
- Create IdeaのEsc close / focus restore: 成功
- Hold理由ModalのEsc取消 / status不変: 成功
- Idea削除後のUndo toast表示: 成功
- console warning / error: 0件

ブラウザではOSのファイル選択・Tauri opener・ネイティブwindow closeを操作していない。これらはTauri build成功、既存自動テスト、および過去の手動確認に依存する。

## 6. 配布物

2026-07-16 12:39 JSTに次を再生成した。

```text
D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe
D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi
D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe
```

サイズ:

- portable exe: 11,049,984 bytes
- MSI: 3,522,560 bytes
- NSIS installer: 2,380,250 bytes

## 7. 既知の制約・未評価項目

1. `npm run build` とTauri内のVite buildで、minified JS chunkが500kBを超える警告が出る。buildは成功しており、Phase 3.6.4ではcode splittingを行っていない。
2. `npm run eval:real-midi` のGold / Silver / Bronzeは0件である。したがって、保存済み実曲に対する精度・回帰guardは今回の実測対象になっていない。「0 failure」だけを精度合格とは扱わない。
3. `eval:midi:datasets` のreal-world unlabeled directoryは未指定で0件。今回実測した100件は `docs/loop-vault-evaluation-corpus/manifest.json` のラベル付きsynthetic corpusである。
4. ブラウザQAでは実MIDIのOS drag & drop、Tauri file picker、フォルダを開く、import/export、backup restoreの実ファイル操作を実行していない。
5. Phase 3.7 Live MIDI Chord Mode、Rust/ONNX移行、解析アルゴリズム再調整は未実装で、Phase 3.6.4のscope外である。
6. Phase 3.6.4のPRはstacked状態で未マージ。最下段 #67 から #82、続いて本報告書PRの順にマージする必要がある。

## 8. ユーザーに確認してほしい点

1. NSIS installerで上書きinstallし、起動・通常終了（右上×）ができること。
2. 実際のMIDIをdropし、全曲ミニマップから候補を選ぶと全曲タイムラインの開始小節へ移動すること。
3. コードを編集中に別候補を押した場合、未保存変更の確認で「キャンセル」と「破棄して移動」が意図どおり動くこと。
4. 候補・全曲・Vault・Homeの試聴を切り替えても同時に1件だけ鳴り、ヘッダーから停止できること。
5. 進行、参考曲、関連ファイル、Ideaを削除し、5秒以内の「元に戻す」で復元できること。
6. Hold・没へ移動した理由が履歴にだけ表示され、memoへ混入しないこと。
7. 768〜1279px程度でInspector、Vault filter、Settingsが日常操作に十分な密度か、実機の文字サイズで確認すること。

## 9. 次担当への申し送り

- Phase 3.6.4の実装起点は最上段PRブランチを使う。途中ブランチへ直接追加実装しない。
- stackをマージする場合は #67から順番に進め、各merge後に上段PRのbaseを次の未マージbranchまたはmainへ更新する。
- 新しい保存処理はrepositoryへ直書きせず、既存store actionと `applyVaultChange()` を通す。
- 再生処理は `playbackController` と `PlayToggle` を再利用し、独立したaudio singletonを増やさない。
- 削除は `useUndoQueue()` と `UndoToast`、重大操作は `Modal` / `ConfirmDialog` を再利用する。
- UI文言は `src/i18n.ts` へ追加し、日本語とEnglishを同時に実装する。
- MIDI解析の精度改善は、このPhaseのUX変更と分離したタスク・PRで行う。
