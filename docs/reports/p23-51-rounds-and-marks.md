# P23-51 まちがいの見せ方・5 つの丸・5 問の区切り・見本の比べ

- 基点: `feat/p23-50-guided-redesign` の `bad18ae8`（P23-50 の後） → `eb8d7afb` の上に `P23-51-fix-1` を適用して再開
- ブランチ: `feat/p23-50-guided-redesign`
- 指示書: `inbox/P23-51/P23-51.md` / `inbox/P23-51-fix-1/P23-51-fix-1.md` / 順番: `inbox/P23-連続-2026-11-20.md`
- 状態: **再開して完了**（`P23-51-fix-1` の決まりどおり、`p23-49-guided-stage.spec.ts` の値の表 4 件のみ P23-52 前のため未通過許容。その他は全 PASS）。

## 1. 差分の適用と修正ファイル・行

- `P23-51.patch`（15 ファイル）は `eb8d7afb` で適用済み。
- `P23-51-fix-1.patch`（`e2e/p23-51-rounds-and-marks.spec.ts` L180–L184 の `advanced-why` 期待修正）を `git apply` で適用。
- `e2e/p23-51-rounds-and-marks.spec.ts` L70・L101: 768×640 切替直後のサイドバー収束待ち（`waitForTimeout(350)`）を追加し、報告写真の 98px ずれを解消。
- 5 問区切り（`course-break-next` / `course-break`）を抜ける追記（計 7 件分）:
  - `e2e/p23-45-advanced-course.spec.ts` L124（20 問ループの 5・10・15 問目後）
  - `e2e/p23-47-fix-2-answer-feedback.spec.ts` L134–L135（5 問目 Enter 後の `course-break` → Enter）および L199–L200（5 問目自動進行後の `course-break` → `course-break-next`）
  - `e2e/p23-47-fix-4-ear-and-sight.spec.ts` L64–L71（`answerNames` ヘルパーの 5・10・15 問目後）

## 2. 点検（すべて PASS）

| 点検 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx tsc -p tsconfig.e2e.json` | PASS |
| `npm run lint`（ESLint + class lint + source contracts） | PASS |

## 3. 回した物（P23-51-fix-1 適用後）

- `npx vitest run src/views/chord-dojo src/components/music-keyboard`: **351 / 351 PASS**（26 ファイル）
- `UPDATE_REPORT_SCREENSHOTS=1 npm run test:e2e -- e2e/p23-51-rounds-and-marks.spec.ts --project=chromium-desktop`: **4 / 4 PASS**
- 残り 12 spec（`p23-50` / `p23-40` / `p23-42` / `p23-44` / `p23-45` / `p23-46` / `p23-47-fix-2` / `p23-47-fix-3` / `p23-47-fix-4` / `p23-47` / `p23-49` / `dojo-display-judge`）: **69 PASS / 4 FAIL**
  - FAIL 4 件はすべて `e2e/p23-49-guided-stage.spec.ts` の「the stage keeps the value table at 1366x768 / 1280x720 / 1024x768 / 768x640」（`.gc-head` 高さ 92 / 88 / 92 / 126）。`P23-51-fix-1` 1 節の決まりどおり **P23-52 の前なので落ちる（許容）**。

## 4. 写真の目視比較（`docs/reports/p23-51-assets/` vs `handoff/mocks/p23-51/`）

7 枚すべてを直接目視確認（`demo-1440`, `demo-768`, `wrong-1440`, `wrong-768`, `break-1440`, `lv4-wrong-1440`, `lv4-break-1440`）:
- `demo-1440` / `demo-768`: 4 枚横並び、Cm・Fm の黄色 ● と差分鍵盤、768 でミニ鍵盤非表示・横はみ出しなし。
- `wrong-1440` / `wrong-768`: 緑 ✓・赤 ✕・水色点線の輪、2 行目 `.gc-why`、凡例との重なりなし（768 の 98px ずれも解消）。
- `break-1440` / `lv4-break-1440`: 5 問区切りの見出し・ひとことマーカー・比較ミニ鍵盤・主ボタン配置が見本と一致。
- `lv4-wrong-1440`: C/E 誤答の赤 ✕×3・点線の輪×2・2 行目表示が見本と一致。

## 5. FULL 結果（コミット `2ff36691`）

- `npm run test:full`:
  - 静的点検 10 種（Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 / Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript）: **すべて PASS**
  - Vitest full: **7,057 PASS / 2 skipped / 1 FAIL**（未変更テスト `src/domain/p21SingleNoteFingering.test.ts` の負荷タイムアウト 30000ms。ログ: `.local-evaluation/test-logs/2026-11-19T08-37-27-812Z-vitest-full.log`）
  - 単独 3 回再実行（`npx vitest run src/domain/p21SingleNoteFingering.test.ts`）: **3 / 3 PASS**（19/19 × 3 回。連続手順書の決まりどおり継続）
- 全 Playwright E2E（`npm run test:e2e`、FULL が Playwright 前で止まったため手動実行）: **1,294 PASS / 2 skipped / 4 FAIL**
  - FAIL 4 件はすべて `e2e/p23-49-guided-stage.spec.ts` の値の表 4 件（1366×768 / 1280×720 / 1024×768 / 768×640）。`P23-51-fix-1` 1 節の決まりどおり P23-52 前のため継続。
- master へのマージ・push なし。P23-53 へ進む。
