# P23-55 耳の階段・迷った問題の練習 — 実装報告

- ブランチ: `feat/p23-50-guided-redesign`
- 参照指示: `inbox/P23-55/P23-55.md` / `P23-55.patch`
- 目的: Lv7 の練習に「2コードの機能（I → ?）」と「ベースから」の階段を足し、コード名の正解でも 2.5 秒より長くかかった「迷った問題」を間違えた問題と一緒に結果画面 ⑧ と地図の「確認待ち・確認できます」駅から練習へ戻す。

## 変更点

### 1. パッチ適用（9 ファイル）
- `src/domain/chordDojo/guidedCourse/review.ts` / `review.test.ts`: `HESITATION_MS = 2500`・`weakItemIdsFor(store, level, block, attemptId)`
- `src/domain/chordDojo/guidedCourse/advanced/review.ts` / `review.test.ts`: `weakAdvancedItemIdsFor(store, attemptId)`・`latestAdvancedAttemptId(store, level, block, group?)`
- `src/domain/chordDojo/guidedCourse/advanced/practice.ts` / `practice.test.ts` / `earStairs.test.ts`: `LV7_FUNCTION_ITEMS`（7 問）・`LV7_BASS_ITEMS`（3 つ）・`lv7-prac-pop-4`・Lv7 練習並び（機能 → ベースから 3 つ → 既存の 6 つ）
- `src/views/chord-dojo/GuidedPracticePanel.tsx`: 見本進行を持たない練習にも「自分で弾く（n問）」を表示、Lv7 説明文更新
- `e2e/p23-55-ear-stairs.spec.ts`: Lv7 耳の階段 E2E（`captureReportShot` 対応・768×640 の待機調整）

### 2. 画面追加（§2）
- `src/views/chord-dojo/GuidedResultSheet.tsx` / `guidedMap.css`: `slowCount` を受け取り、`> 0` のとき棒グラフ下に 13px 薄字で「正解でも 2.5 秒より長くかかった問題が {slowCount} 問あります（合格には数えます）」（`data-testid="course-result-slow"` / `"advanced-result-slow"`）を表示
- `src/views/chord-dojo/GuidedCourseView.tsx` / `AdvancedCourseView.tsx`:
  - 結果画面 ⑧ の 2 番目ボタンを `weakItemIdsFor` / `weakAdvancedItemIdsFor` に切り替え、文言を「間違えた・迷った問題を練習（n問）」へ更新（0 問時は既存の弱点練習へフォールバック）
  - 地図の `course-map-weak` から直接 `initialWrongIds` で弱点練習に入り、終了・戻りで地図へ戻る導線を追加
- `src/views/chord-dojo/GuidedBasicPractice.tsx` / `AdvancedCourseView.tsx`: 練習画面の見出し・進み・終了見出し・再練習ボタンの文言を「間違えた・迷った問題の練習」へ統一
- `src/views/chord-dojo/GuidedCourseMap.tsx`: 状態が `waiting` / `due` の駅で最新 `sameDay` 試行の `weakIds.length > 0` のときに「迷った・間違えた問題を練習（n問）」（`data-testid="course-map-weak"`）を追加
- `e2e/p23-47-fix-2-answer-feedback.spec.ts`: 練習進み文言の期待値を「間違えた・迷った問題の練習」へ更新（§2-2 の意図した変更）
- `e2e/p23-55-weak-practice.spec.ts`: W1〜W4 の E2E 追加

## 検証結果

- `npx tsc --noEmit`: PASS
- `npx tsc -p tsconfig.e2e.json --noEmit`: PASS
- `npm run lint`（ESLint + Tailwind classes + source contracts）: PASS
- `npx vitest run src/views/chord-dojo src/domain/chordDojo/guidedCourse`: 38 files / 445 passed
- `npm run test:e2e -- e2e/p23-55-ear-stairs.spec.ts e2e/p23-55-weak-practice.spec.ts e2e/p23-47-fix-2-answer-feedback.spec.ts e2e/p23-46-guided-practice.spec.ts e2e/p23-52-course-map.spec.ts --project=chromium-desktop`: 24/24 passed（6 + 18）

## スクリーンショット確認（`docs/reports/p23-55-assets/`）

- `func-hub-1440.png` / `func-question-1440.png`: Lv7 練習の並び・説明・「自分で弾く（7問）」・1/7 機能問題を確認
- `bass-hub-1440.png` / `bass-question-{1440,1280,768}.png`: 短調のベースから（Bm7♭5・E7・Am7）・1/2 ベース問題・全幅オーバーフローなしを確認
- `w1-result-{1440,768}.png`: 18/20 合格・棒下 3 問メッセージ・2 番目ボタン「間違えた・迷った問題を練習（5問）」を確認
- `w3-map-{1440,768}.png`: 確認待ち Lv1 駅の「迷った・間違えた問題を練習（3問）」ボタンを確認

## FULL テスト結果

- 対象コミット: `c1ac770c`
- 静的ゲート 10/10 PASS（Source contracts / AI handoff / Class lint / Phase docs / Privacy scan / Runner contracts 43/43 / E2E TypeScript / Production build / Repository ESLint / App TypeScript）
- Vitest full: PASS（7,078 / 7,080）
- Playwright full (core, 55 specs, 216.9s): 本段の変更範囲（P23-55 含むガイド練習系）は全 PASS。無関係な `e2e/voicing-loop-v2.spec.ts:279`（`VL-07 256 PracticeGroups`）の 1 件のみ一時失敗（ログ: `.local-evaluation/test-logs/2026-11-19T11-34-49-112Z-playwright-full-core-.log`）。
- 連続指示書の決まりに従い単独 3 回再実行（`npx playwright test e2e/voicing-loop-v2.spec.ts -g "VL-07" --project=chromium-desktop --repeat-each=3`）: **12/12 PASS（対象テスト 3/3 PASS）**。P23-56 へ継続。
