# P23-53 総合確認の合格の線・耳の問題の音の輪

- 基点: `feat/p23-50-guided-redesign` の `a569a74d`（P23-51-fix-1 の後）
- ブランチ: `feat/p23-50-guided-redesign`
- 指示書: `inbox/P23-53/P23-53.md` / 順番: `inbox/P23-連続-2026-11-20.md`
- 状態: **実装・個別検証完了、FULL 実施前**（P23-51-fix-1 の決まりどおり `p23-49-guided-stage.spec.ts` の値の表 4 件のみ P23-52 前のため未通過許容）。

## 1. 差分の適用と修正ファイル・行

- `P23-53.patch`（10 ファイル）: `git apply --check` → `git apply` が衝突なく適用。
  - 総合確認の合格の線緩和（`levels.ts` / `levels.test.ts` / `review.test.ts`）: 初見 8 小節 3→2（同日合計 29→28）、別日の耳 3→2（別日合計 14→13）。
  - 基礎コース・自由練習の耳問題に音の輪 `EarDisc`（150px / 112px / 72px 横並び）と「一番低い音は {根音}」「聴こえた和音を、そのまま弾く」を反映（`GuidedRound.tsx` / `guidedRound.css` / `GuidedCourseView.tsx` / `GuidedBasicPractice.tsx`）。
- 意図した変更による既存テスト調整（指示書 3 節）:
  - `e2e/p23-49-guided-stage.spec.ts` L180: 耳問題の期待 `"根音"` → `"一番低い音は"`。
  - `e2e/p23-53-ear-disc-and-pass-lines.spec.ts` L59: 1280/768 切替後のサイドバー収束待ち（`waitForTimeout(350)`）を追加。

## 2. 点検（すべて PASS）

| 点検 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx tsc -p tsconfig.e2e.json` | PASS |
| `npm run lint`（ESLint + class lint + source contracts） | PASS |

## 3. 回した物

- `npx vitest run src/views/chord-dojo src/domain/chordDojo/guidedCourse`: **426 / 426 PASS**（35 ファイル）
- `UPDATE_REPORT_SCREENSHOTS=1 npm run test:e2e -- e2e/p23-53-ear-disc-and-pass-lines.spec.ts --project=chromium-desktop`: **1 / 1 PASS**
- 残り 6 spec（`p23-42` / `p23-44` / `p23-45` / `p23-47-fix-4` / `p23-49` / `p23-51`）: **37 PASS / 4 FAIL**
  - FAIL 4 件はすべて `e2e/p23-49-guided-stage.spec.ts` の値の表 4 件（1366×768 / 1280×720 / 1024×768 / 768×640）。P23-52 前のため継続許容。

## 4. 写真の目視比較（`docs/reports/p23-53-assets/` vs `handoff/mocks/p23-53/`）

4 枚すべてを直接目視確認（`ear-playing-1440`, `ear-ready-1440`, `ear-1280`, `ear-768`）:
- `ear-playing-1440` / `ear-ready-1440`: 150px の音の輪・広がる外輪・丸い札「一番低い音は F」・案内 1 行・再生中／弾いてください切替が見本と一致。
- `ear-1280`: 112px の音の輪とヒント表示が鍵盤上に収まり重なりなし。
- `ear-768`: 72px の音の輪と札が横並びになり、別行の再試聴ボタンが隠れ、鍵盤上に綺麗に収まっている。

## 5. FULL 結果（コミット `7f8ee80f`）

- `npm run test:full`:
  - 静的点検 10 種（Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 / Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript）: **すべて PASS**
  - Vitest full: **7,059 PASS / 2 skipped / 0 FAIL**
  - Gallery excluded: **PASS**
  - Playwright full: **1,241 PASS / 2 skipped / 5 FAIL**（ログ: `.local-evaluation/test-logs/2026-11-19T09-01-36-733Z-playwright-full.log`）
    - うち 4 件は `e2e/p23-49-guided-stage.spec.ts` の値の表 4 件（1366 / 1280 / 1024 / 768、`P23-51-fix-1` 1 節により P23-52 前のため継続許容）。
    - 残り 1 件は未変更テスト `e2e/p23-23a-ear-stage.spec.ts`（C1）。単独 3 回再実行で **3 / 3 PASS**（7/7 × 3 回。連続手順書の決まりどおり継続）。
- master へのマージ・push なし。P23-52 へ進む。
