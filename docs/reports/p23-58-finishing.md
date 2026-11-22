# P23-58 仕上げ 報告 (2026-11-20)

- ブランチ: `feat/p23-57-58-finishing`（`master` 未マージ・未 push）
- 実装コミット: `a9108dfb` → `be20f393`（+ 本報告コミット）
- テスト追加: `e2e/p23-58-motion.spec.ts`（7/7 PASS）、`src/store/vaultStore.test.ts`（B5）
- 画面写真: `docs/reports/p23-58-assets/`（28 枚）

## A. 小さい動き（10 個）の場所と確認

共通基盤: `src/components/ui/motion.tsx`（`FavoriteDots`, `useTransientFlag`, `useSaveButtonState`）、`src/styles/components.css`（`@layer components` 内に `@media (prefers-reduced-motion: reduce)` を配置し、動きを減らす設定で全アニメーション・遷移を停止）。

| # | 何 | 実装場所 | 印 / 確認 | 写真 |
|---|---|---|---|---|
| 1 | コピー | `VaultView.tsx`, `ProgressionWorkspacePage.tsx`, `ProgressionDetailView.tsx` | `data-copied="true"`（1.1s で解除、✓ 出現） | `a1-copy.png` |
| 2 | ♥ | `VaultView.tsx`, `ProgressionWorkspacePage.tsx`, `VoicingLoopPicker.tsx` | `data-pop="true"`（0.3s、追加時のみ・6 点放射、reduced-motion 時 `animationName === "none"`） | `a2-favorite.png` |
| 3 | Vault に保存 | `TextProgressionCapturePanel.tsx`, `ExtendedTextIntakePanel.tsx`, `SaveProgressionPopover.tsx`, `WorkspaceSaveForm.tsx`, `LiveMidiImportDialog.tsx` | `data-save-state="idle\|busy\|done"`、横の「保存しました」を削除 | `a3-save-done.png` |
| 4 | 切り替え | `src/components/ui/controls.tsx` (`SegmentedControl`) | `[data-segment-pill]` が選択位置・幅へ 0.18s でスライド（±1px 一致確認） | `a4-segmented.png` |
| 5 | スイッチ | `src/components/ui/controls.tsx` (`Switch`), `src/styles/components.css` | 0.18s 遷移（`aria-checked`） | `a5-switch.png` |
| 6 | MIDI を持ってくる | `src/views/capture/CaptureEntry.tsx`, `src/styles/capture-entry.css` | `dragenter` で実線水色枠・`#0f2529`・`scale(1.01)`、「放すと読み込みます」/「.mid ・ .midi」 | `a6-drop-over.png` |
| 7 | BPM | `src/components/BpmScrubField.tsx`, `src/components/GlobalBpmField.tsx` | ドラッグ・ホイール時のみ `data-roll="up\|down"`（手入力では付けない） | `a7-bpm-roll.png` |
| 8 | 段の流れ | `src/views/ear-practice/EarRun.tsx`, `ear-practice.css`, `EchoPracticeChrome.tsx`, `bassPractice.css` | 線の `data-filled="true"`（0.2s 塗り、0.16s 遅延で次の丸が点灯） | `a8-steps.png` |
| 9 | 鳴っている印 | `VoicingLoopPicker.tsx`, `CorrectionInspector.tsx`, `GuideChordCard.tsx`, `GuidedCourseView.tsx`, `AdvancedCourseView.tsx`, `GuidedPracticePanel.tsx` | `data-playing="true"` + 3 本棒 `PlayingMark`（reduced-motion 時は 6/12/8px 固定） | `a9-playing-mark.png` |
| 10 | 数字の送り | `src/views/chord-dojo/DojoHome.tsx`, `Master251View.tsx` | セッション内の前回値から変化した項目のみ初回帰還時に `data-rolled="true"`（0.3s） | `a10-stat-roll.png` |

## B. 持ち越し項目の前・後の値

| # | 項目 | 前 | 後 | 備考 / 写真 |
|---|---|---|---|---|
| B1 | 1280×720 進行ページのロール高さ | 可視ロール **124px**（cards 80px, gap 20px, legend 40px 2行） | 可視ロール **163px**（cards 76px, gap 8px, legend 17px 1行, 縦スクロール 0px） | ①→②→③ の順で適用し目標 160px 以上達成。`b1-before-1280.png` / `b1-after-1280.png` |
| B2 | タグの窓 | 旧四角ボタン | ピル型チップ・丸入力・円形 +（`ProgressionTagsEditor.tsx`, `correction-workspace.css`） | `b2-tags-dialog.png` |
| B3 | Vault → Bass Practice | ボタンなし | Vault 右に `vault-go-bass`（`BP Bass Practice でベースを弾く`、使用可能進行のみ表示） | `b3-vault-right.png` |
| B4 | 1440×900 修正作業場ツールバー | 1 行だが ` ／ 8小節` 非表示（`display: none`, container 1155px 閾値） | **1 行・` ／ 8小節` 表示**（`totalVisible: true`, 閾値 1090px, group padding 8px, zoom padding 7px） | `b4-before-1440.png` / `b4-after-1440.png` |
| B5 | 通常テキスト保存の取り込み元 | 実装確認: `createSavedTextProgressionBlock` は既に `analyzerVersion` を設定し `テキスト` を返していた | 単体テストを追加（`src/store/vaultStore.test.ts`） | 製品コード変更なし・テスト追加のみ |
| B6 | 耳の結果 8 小節（1440×900 / 1366×768） | 1440: overflow **387px** (1071/684) / 1366: **477px** (1041/564) | 1440: overflow **232px** (916/684) / 1366: **322px** (886/564) | 指示どおり行間を 4px 詰めたが届かないため値を報告して次へ |
| B7b | Chromium 音の時計 | Windows 音の出口停止時に `AudioContext.currentTime` 停止 | `--disable-audio-output` で `0 → 0.352s`（350ms 待機）進行を確認。`playwright.config.ts` に付与（出口音計測テスト 0 件確認） | heavy 134/134 PASS |
| B8 | 離れる前ダイアログ「変更 n」 | 出さない決定 | 変更なし | — |
| B9 | VL 候補の内部名 | P23-32 で済 | 変更なし | — |
| B10 | 「セッションのテンポ」/ `home-loop-roll` | `grep` 0 件（「セッションのテンポ」0 件、Vault 帯は共有 `LoopRoll.tsx` のみ） | 変更なし | — |
| B11 | 曲のページ・Dojo 練習 4 画面 | 変更せず 1440×900 で撮影のみ | 5 枚撮影済み | `b11-song-page.png`, `b11-dojo-{master251,jazz,ear,drill}.png` |

### B7 単独 10 回監査の結果表

| テスト | 単独 10 回（`--workers=1`） | 対応 |
|---|---|---|
| `e2e/vl-13-voicing-loop.spec.ts` (VL-13 B) | **vl-13 VL-13 B は P23-33-fix-1 で直した**（5/5 PASS 確認済み） | P23-33-fix-1 で修正済み |
| `e2e/phase5.33-voicing-rule-ui.spec.ts` | 90/90 PASS (10/10) | `tiers.mjs` の `EXTENDED_HEAVY_SPECS` へ移動 |
| `e2e/dojo-display-judge.spec.ts` | 90/90 PASS (10/10) | 既に `EXTENDED_HEAVY_SPECS`（維持） |
| `e2e/jazz-progressions.spec.ts` (`:473/:665`) | 10/10 PASS | `EXTENDED_ARCHIVE_SPECS` → `EXTENDED_HEAVY_SPECS` へ移動 |
| `e2e/p12-4-long.spec.ts` | 80/80 PASS (10/10) | `EXTENDED_ARCHIVE_SPECS` → `EXTENDED_HEAVY_SPECS` へ移動 |
| `e2e/p23-23a-ear-stage.spec.ts` (`:76/:116`) | 10/10 PASS | `EXTENDED_ARCHIVE_SPECS` → `EXTENDED_HEAVY_SPECS` へ移動 |
| `e2e/p16-ear-keyboard.spec.ts` (`:45`) | 40/40 PASS (10/10) | `EXTENDED_HEAVY_SPECS` へ移動 |
| `e2e/voicing-loop-v2.spec.ts` (VL-07) | 40/40 PASS (10/10) | `EXTENDED_HEAVY_SPECS` へ移動 |

## E. 追加（E1〜E6）の結果

- **E1**: `BassPracticeHome.tsx` の 2 つの `<small>` と未使用 CSS `.lv-bh-group > small` を削除（`e1-bass-home.png`）。
- **E2（「続きから」4 値の比較、1440×900）**:

| 画面 | 帯の高さ | 印の大きさ | タイトル字の大きさ | ボタンの高さ | 写真 |
|---|---|---|---|---|---|
| Voicing Loop 進行選び | **57px** | **30×30px** | **14px** | **36px** | `e2-resume-vl.png` |
| Chord Dojo ホーム | **57px** | **30×30px** | **14px** | **36px** | `e2-resume-cd.png` |
| Bass Practice ホーム（参考・未変更） | **57px** | **30×30px** | **14px** | **36px** | `e2-resume-bp.png` |

※ 3 画面すべて 0px 差で完全一致（`dojoHome.css:221-235` の現行値に合わせたため `p23-41`・`p23-43` もそのまま全通）。

- **E3**: `guidedCourse.css` の下線指定を消し `RotateCcw` アイコン付き `.dojo button` 化（基礎・高度とも）。`e2e/p23-49-guided-stage.spec.ts` の帯高さ表（60・52・60・60・88）不変を確認（`e3-restart-1440.png`, `e3-restart-768.png`）。
- **E4 / E5 / E6（`<select>` 置換一覧）**:

| ファイル | 結果 | 理由 |
|---|---|---|
| `LiveMidiSettingsSection.tsx` (E4) | `Select` へ置換 | OS 矢印のまま（`appearance` 未指定） |
| `SettingsView.tsx` (E5) | `Select` へ置換 | `settings-import-mode` が OS 矢印のまま |
| `SourceBasslineCapturePanel.tsx` (2 か所) | `Select` へ置換 | OS 矢印のまま（`max-w-full` 維持） |
| `SectionSaveDialog.tsx` | `Select` へ置換 | OS 矢印のまま |
| `LiveMidiImportDialog.tsx` | `Select` へ置換 | OS 矢印のまま |
| `LiveMidiMiniMode.tsx` | `Select` へ置換 | OS 矢印のまま |
| `ChordStructureEditor.tsx` | `Select` へ置換 | OS 矢印のまま |
| `SaveProgressionPopover.tsx` | `Select` へ置換 | `Select` を `forwardRef` 化し `ideaSelectRef` 維持 |
| `VoicingPanel.tsx` (2 か所) | `Select` へ置換 | OS 矢印のまま |
| `BuiltinProgressionList.tsx` (3 か所) | `Select` へ置換 | OS 矢印のまま |
| `OriginalPracticeView.tsx` | `Select` へ置換 | OS 矢印のまま |
| `ProgressionDetailView.tsx` | `Select` へ置換 | OS 矢印のまま |
| `ProgressionWorkspacePage.tsx` | `Select` へ置換 | OS 矢印のまま |
| `ProgressionVoicingPracticeView.tsx` (5 か所) | `Select` へ置換 | OS 矢印のまま |
| `FingeringRankerComparisonSettings.tsx` | `Select` へ置換 | OS 矢印のまま |
| `VaultView.tsx` (`.lv-vault-sort select`) | 変更せず | `src/styles/vault.css:348` で既に `appearance: none` + 自前矢印あり |
| `GuidedLevelSelect.tsx` | 変更せず | 指示どおり（P23-52 で未使用） |

## 自分で決めた所（2026-11-20 ルール）

| 何を | なぜ | 確かめ方 |
|---|---|---|
| `GuidedCourseView.tsx` の `course-demo-start` / `course-demo-skip` で `setDemoPlaying(false)` を明示呼び出し | 再生中にスキップすると `exampleToken` 更新で `onEnded` が無視され `data-playing="true"` が残る不具合を防止 | `e2e/p23-58-motion.spec.ts` A9 テスト PASS |
| `components.css` の `@media (prefers-reduced-motion: reduce)` を `@layer components` 内に配置 | Tailwind v3 の出力順で unlayered `@media` が `@layer components` より前に展開され、`lvHeartPop` が上書きされなかったため | `e2e/p23-58-motion.spec.ts` reduced-motion テストで `animationName === "none"` PASS |
| `voicing-loop.css` の `.lv-vl-resume` を `dojoHome.css:221-235` の現行値（57px / 30×30 / 14px / 36px）に統一 | `dojoHome.css` 末尾の上書きが実際の Chord Dojo ホームに効いており、指示書冒頭の旧値（42×42 / 17px）だと CD と 12px ズレて `p23-41`・`p23-43` も壊れるため | `e2e/p23-58-motion.spec.ts` E2 ±1px 検証 + `p23-41`・`p23-43` 全通 |
| Lucide アイコンサイズを `size={16}` に統一（縮小は CSS 側で制御） | `npm run lint:source-contracts` の「Lucide アイコンは 16px または 20px を明示」契約を満たすため | `npm run lint` PASS |
| `CaptureEntry.test.tsx:56` を「放すと読み込みます」へ更新、`SourceBasslineCapturePanel.tsx` の `Select` に `max-w-full` を保持 | A6 の意図した文言変更と E6 の既存狭幅クラス契約を両立するため | `npx vitest run` 7,108/7,110 PASS |

## `npm run test:full:all` 結果（HEAD: `be20f393`）

- 静的チェック 10/10: **PASS**（Source contracts / AI handoff / Phase docs / Class lint / Runner contracts 44/44 / Privacy scan / E2E TS / Production build / ESLint / App TS）
- Vitest full: **PASS**（7,108 / 7,110、2 skipped）
- Gallery excluded: **PASS**
- Playwright full (all light): **1,191 passed / 2 skipped / 3 failed**（12.1m）
  - `e2e/visual.spec.ts:70` (`vault-chromium-desktop-win32.png`, 6,186px / 1% diff): B3（`BP Bass Practice でベースを弾く` 追加）と A5（`Switch` 更新）による意図した見た目の変化。ルールどおり基準 PNG は更新せず報告。
  - `e2e/p18-01-stage2.spec.ts:158`・`:393`: P23-58 で変更していないテスト。単独 3 回（`--workers=1 --repeat-each=3`）で **33/33 PASS** を確認。
- Playwright `extendedHeavy`（`--workers=2`, 12 spec）: **134 / 134 PASS**（7.9m）
