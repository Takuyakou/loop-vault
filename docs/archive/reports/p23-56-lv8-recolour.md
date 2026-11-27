# P23-56 Lv8 の作り直し — 実装報告

- ブランチ: `feat/p23-50-guided-redesign`
- 参照指示: `inbox/P23-56/P23-56.md` / `P23-56.patch`
- 目的: Lv8 の各群を「コード名 12・進行の中で 4・耳 6（同日）／コード名 6・進行の中で 3（別日）」（計 66 + 27 問）に再編成し、元の進行から響きを足す差し替え問題と「元の進行を聴く」（ヒント扱いしない）ボタン、および各群の練習「進行の中で響きを足す（7 問）」を追加する。

## 変更点

### 1. パッチ適用（12 ファイル・競合なし）
- `src/domain/chordDojo/guidedCourse/advanced/lv8.ts`: 新構成（6・add9・sus / 9系 / 13・ルートレス各群の同日 22 問・別日 9 問、`plainChords`）
- `src/domain/chordDojo/guidedCourse/advanced/levels.ts`: Lv8 の問題数・合格線・`{group}:context` / `{group}:delay-context` 部分定義・説明文
- `src/domain/chordDojo/guidedCourse/advanced/types.ts` / `build.ts`: `plainChords` 型・構築サポート
- `src/domain/chordDojo/guidedCourse/advanced/practice.ts`: 各群末尾に「進行の中で響きを足す」（7 問）を追加
- `src/views/chord-dojo/AdvancedCourseView.tsx`: `playPlain` と「元の進行を聴く」（`data-testid="advanced-listen-plain"`、ヒント扱いにしない）を追加
- `src/domain/chordDojo/guidedCourse/advanced/bank.test.ts` / `levels.test.ts` / `review.test.ts` / `practice.test.ts` / `src/views/chord-dojo/AdvancedCourseView.test.tsx`: 新問題数・テスト更新
- `e2e/p23-56-lv8-recolour.spec.ts`: Lv8 差し替え問題 E2E（`captureReportShot` 対応・`recolour-hub-1440` 追加・768×640 の待機調整）

### 2. 追加で更新した既存テスト（§4 許可範囲）
- `src/domain/chordDojo/guidedCourse/advanced/practice.test.ts` L109–117: `lv8NameCombos` の期待数を旧 20 / 10 から新 12 / 6 へ更新
- `src/views/chord-dojo/AdvancedCourseView.test.tsx` L428: Lv8 群の練習教材ボタン数の期待を旧 4 から新 5（末尾に「進行の中で響きを足す」追加）へ更新

### 3. 結果画面 ⑧ の部分ごとの棒（§2 確認）
- `src/views/chord-dojo/AdvancedCourseView.tsx` の結果画面 ⑧（`GuidedResultSheet`）の `bars` は `report.parts` から動的生成しているため、Lv8 の `{group}:context` / `{group}:delay-context` 部分が自動で表示されることを確認済み（追加修正なし）。

## 検証結果

- `npx tsc --noEmit`: PASS
- `npx tsc -p tsconfig.e2e.json --noEmit`: PASS
- `npm run lint`（ESLint + Tailwind classes + source contracts）: PASS
- `npx vitest run src/views/chord-dojo src/domain/chordDojo/guidedCourse`: 38 files / 446 passed
- `npm run test:e2e -- e2e/p23-56-lv8-recolour.spec.ts e2e/p23-45-advanced-course.spec.ts e2e/p23-46-guided-practice.spec.ts e2e/p23-47-guided-level-restart-and-header.spec.ts e2e/p23-52-course-map.spec.ts --project=chromium-desktop`: 21/21 passed（1 + 20）

## スクリーンショット確認（`docs/reports/p23-56-assets/`）

- `recolour-hub-1440.png`: Lv8 3 群表示（`0/22 ・ 別日 0/9`）・「進行の中で響きを足す」選択・「自分で弾く（7問）」を確認
- `recolour-1440.png` / `recolour-1280.png` / `recolour-768.png`: 1/7 `Dm9 → G13 → Cmaj9`、`元の進行 Dm7 → G7 → Cmaj7。響きを足して弾く`、「元の進行を聴く」押下後も「ヒントあり」なし、768×640 で鍵盤と重ならず横スクロールなしを確認

## FULL テスト結果

- 対象コミット: `d39558df`
- 結果: **PASS（352.5s）**
  - 静的ゲート 10/10 PASS（Source contracts / AI handoff / Class lint / Phase docs / Privacy scan / Runner contracts 43/43 / E2E TypeScript / Production build / Repository ESLint / App TypeScript）
  - Vitest full: **PASS（7,079 / 7,081、88.8s）**
  - Playwright full (core, 56 specs): **PASS（374 / 374、235.9s、goto の開き直り 0 回）**
  - Git diff check: PASS / Tracked PNG check: PASS
  - ローカルログ: `.local-evaluation/test-logs/2026-11-19T11-46-37-864Z-full.log`
