# P23-48 Chord Dojo の音の二重鳴り・Voicing Loop の色

- 基点: local master `1d5969cc`
- ブランチ: `feat/p23-48-dojo-audio-and-vl-color`
- 状態: P23-48-fix-1（追記 2 まで）を実施。レビュー写真を書いていた 9 本の spec を `p89-generated/report-screenshots/` に移し、9 本 **40 / 40 PASS**、追跡 PNG の変化なしを確認。FULL は 2 回とも**別々の負荷依存の揺れ**（1 回目 Vitest のフォーカス、2 回目 Playwright の 30 秒タイムアウト）で FAIL したため、指示書・連続の決まりに従って**ここで止め、master へは入れていない**。push もしていない。
- 指示書: `<作業フォルダ>\lv-handoff\inbox\P23-48\P23-48-dojo-audio-and-vl-color.md`、`<作業フォルダ>\lv-handoff\inbox\P23-48-fix-1\P23-48-fix-1.md`（2026-11-19 0:30 書き直し）と追記

## 1. 結論

- **音**: Chord Dojo で MIDI 鍵盤を 1 回押すと、ピアノは 1 回だけ鳴る。ホーム・練習・ガイド練習で鳴り、一覧（型の一覧など）・終わり・自前で鳴らす画面（2-5-1 Master・ずっと練習・耳・Original・ボイシングドリル）では Chord Dojo 側から鳴らない。
- **色**: ユーザーが実際の画面を見て桃紫に違和感があったため、**P23-48-fix-1 で Voicing Loop を P23-48 の前の水色（`--lv-accent` `#42d8c6`）に戻した**。P23-48 で足した桃紫のトークンと置き換えは消した。次の 4 つは残した。
  1. 音の二重鳴りの直し。
  2. Voicing Loop の右手を鍵盤の右手の水色 `#22d3ee` にそろえたこと（左手は橙 `#f59e0b` のまま）。
  3. 左メニューの Bass Practice の行が薄紫、ホームの「練習」の Bass の 1 週間の棒が薄紫。
  4. Vault の「Chord Dojo で覚える」の印が、誤った Bass の薄紫から水色。Voicing Loop の印も水色（2 つとも水色）。
- **耳のチップ（P23-48-fix-1）**: 耳で弾くの「足りない音」で、文は判定の名前（`recipes.ts` の `NAMES`、1 番目が `D♭`）で「D♭ がありません」と言うのに、点線のチップは `EarRun.tsx` の `NAMES`（1 番目が `C♯`）で「C♯」と出ていた。`EarRun.tsx` の 1 番目を `D♭` にそろえた。ランダムに選ばれる不足音が D♭ の回だけ出ていた本物の食い違いで、間欠ではない。

## 2. 変えたファイル（master `1d5969cc` との差）

| ファイル | 変更 |
|---|---|
| `src/views/chord-dojo/ChordDojoView.tsx` | `useDojoMidi(guideOpen\|\|screen==='home'\|\|screen==='practice')`。音を鳴らす画面を限定 |
| `src/styles/voicing-loop.css` | `[data-practice-mode="voicing-loop"]` の桃紫の置き換えを削除。進み具合の `.lv-vl-progress-done`（`--lv-accent` 45% と面の色の混ぜ）と右手 `--vh-color: #22d3ee` は残す |
| `src/styles/shell.css` | Bass Practice の行だけ薄紫（`--lv-practice-bass`）。Voicing Loop は基本の水色 |
| `src/styles/home.css` | Bass Practice の 1 週間の棒だけ薄紫。Voicing Loop は基本の水色 |
| `src/styles/vault.css` | 「Chord Dojo で覚える」の薄紫の決まりを削除（VL・CD とも基本の水色） |
| `src/views/ProgressionVoicingPracticeView.tsx` | 右手の指の要約を `text-cyan-200`、進み具合を `lv-vl-progress-done`、「前後に合わせて変化」と選んだカードの拍を `--lv-accent` に |
| `src/features/bass-practice/ui/PracticeWorkspace.tsx` | `data-practice-mode` は使わない（P23-48-fix-1 で削除）。768 幅の切り替えは VL が基本の水色、BP が薄紫 |
| `src/views/ear-practice/EarRun.tsx` | `NAMES[1]` を `C♯` → `D♭`（P23-48-fix-1。判定の言葉と同じ名前） |
| `e2e/p23-48-dojo-audio-and-vl-color.spec.ts` | 新規 4 本（音が 1 回、左メニュー、VL の水色・右手、Vault の印） |
| `e2e/p23-41-home-motion-resume.spec.ts` | 変更なし（P23-48 で一度桃紫にした期待を P23-48-fix-1 で水色に戻した） |
| `e2e/p23-43-resume-width-and-hover.spec.ts` | 変更なし（水色のまま） |
| `e2e/helpers/reportShots.ts` | 新規（P23-48-fix-1 追記 2）。`UPDATE_REPORT_SCREENSHOTS=1` の時だけ `docs/reports/`、それ以外は `p89-generated/report-screenshots/` |
| `e2e/p23-41`・`p23-42`・`p23-43`・`p23-44`・`p23-45`・`p23-46`・`p23-47-fix-2`・`p23-47-fix-3`・`p23-47-guided-level-restart-and-header` の 9 spec | 写真の保存先だけ `reportShot("…")` に置き換え（テストの中身は不変） |
| `docs/reports/p23-48-assets/` | P23-48-fix-1 で撮り直した 7 枚（Voicing Loop は水色） |

`--lv-accent` の `:root`、Chord Dojo の画面の中の色、左手の橙、押している音の水色、機能の色は変えていない。桃紫の `--lv-practice-voicing*` は追加していない。

## 3. 音の二重鳴り

原因は指示書のとおり、P23-44-fix-1 で `useDojoMidi(true)` になったこと。`ChordDojoView` は Master などの画面を出している間も残るため、どの画面でも Chord Dojo が鳴っていた。`guideOpen||screen==='home'||screen==='practice'` に絞ることで、ガイド練習で鳴らす目的は `guideOpen` で保ち、一覧・終わり・Master・ずっと練習・耳・Original・ボイシングドリルでは Chord Dojo 側から鳴らさない。

新しい E2E の 1 本目が、ガイド練習で 1 回押すと `AudioBufferSourceNode.start` が 1 回だけ増えること、型の一覧では `data-dojo-midi-audio="off"` で増えないことを確認している。P23-45 から FULL で毎回落ちていた 8 件（`p12-chord-dojo` 5、`p12-2-master` 1、`p12-master251-monitor-progression` 2）は、この修正後の FULL で PASS した。

## 4. 色（Voicing Loop は水色のまま）

- Voicing Loop の画面・左メニュー・ホーム・Vault・768 幅の切り替えは、**P23-48 の前と同じ水色**。
- 右手は `#22d3ee`（鍵盤の右手の色）、左手は `#f59e0b` のまま。押している音の水色、機能の色、全体の上の帯も変えていない。
- Bass Practice の行・ホームの 1 週間の棒は薄紫。Vault の CD の印は水色（Bass の薄紫は誤りだったので削除済み）。
- 進み具合の「終わった所」は、固定の teal クラスではなく `--lv-accent` と面の色を混ぜた `.lv-vl-progress-done`。水色の画面では水色系のまま。

## 5. 耳のチップの名前（P23-48-fix-1）

| 場所 | 名前の表 | 1 番目 |
|---|---|---|
| 判定の言葉 `src/domain/earPractice/recipes.ts` | `NAMES` | `D♭` |
| チップ・鍵盤の表示 `src/views/ear-practice/EarRun.tsx` | `NAMES` | 直す前 `C♯` → **`D♭`** |

`F♯` はテスト側が `#` → `♯` に合わせているので、そのまま。`EarRun.tsx` の 1 か所だけ。

## 6. 検証

### 6-1. 点検（すべて PASS）

| 点検 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS（exit 0） |
| `npx tsc -p tsconfig.e2e.json` | PASS（exit 0） |
| `npm run lint`（ESLint + class lint + source contracts） | PASS（exit 0、`Tailwind CSS-variable utilities are valid.` / `Source contracts are valid.`） |
| `npm run build` | PASS（exit 0。既存の chunk 警告のみ） |

### 6-2. E2E

- 指示書の `npx playwright test` をそのまま使うと、`VITE_P527_E2E_FIXTURE=1` の付かない本番ビルドを preview するため fixture が無く誤って落ちる。リポジトリの正規ランナー `npm run test:e2e -- <specs> --project=chromium-desktop` で回した。
- 色を戻した後の 4 spec: **15 / 15 PASS**（25.9 秒）。
  - `p23-48-dojo-audio-and-vl-color.spec.ts` 4/4
  - `p23-41-home-motion-resume.spec.ts` 4/4
  - `p23-43-resume-width-and-hover.spec.ts` 3/3
  - `p23-02-sidebar.spec.ts` 4/4
- 耳: `npm run test:e2e -- e2e/p23-23a-ear-stage.spec.ts --project=chromium-desktop --repeat-each=5` → **34 / 35 PASS（1.5 分）**。D♭ のテスト（`C2/C3/C14`）は 5 回とも PASS。落ちた 1 件は `C1`（`ear-card-bar` の `data-kind` が空）で、不足音の名前とは別の読み取りタイミングの揺れ。C1 だけを単独で 5 回回すと **5 / 5 PASS**（6.9 秒）だった。

### 6-3. FULL

`npm run test:full -- --fresh` を 2 回（どちらも追記 2 の後。2 回目はユーザーの再実行指示による）。

**1 回目（2026-11-19 09:13 開始）**

- 非 Playwright: source contracts、AI handoff、phase docs、class lint、runner contracts 40/40、privacy scan、E2E TypeScript、production build、repository ESLint、App TypeScript — すべて PASS。
- **Vitest: 7047 / 7050（既存 skip 2）で 1 件 FAIL**。`src/views/chord-dojo/GuidedCourseView.test.tsx` の「P23-40 guided course screen > confirms a level restart, cancels back to the same question and returns to Lv1's examples」。
  - 期待: レベルやり直しのダイアログを閉じた後の `document.activeElement` が `level-restart-cancel`（ボタン）。
  - 実際: `course-instruction`（`p.gc-instruction`）。
  - 単独実行: `npx vitest run src/views/chord-dojo/GuidedCourseView.test.tsx` → **12 / 12 PASS**（4.5 秒）。前回の FULL（追記 2 の前）も 7048/7050 PASS で、この差分は `e2e/` だけ（Vitest の対象外）。負荷依存のフォーカスの揺れで、P23-48 の差分に起因しない。
  - 追記 2 の「FULL が落ちたら直さずに止めて報告する。直してよいのは写真の保存先と報告の文だけ」に従い、テストは直していない。FULL のやり直しもしない（直した後のやり直し 1 回、の条件を満たさないため）。
  - 追加調査: 全 Vitest を単独で回すと、5 秒の**タイムアウト**が複数（`p21SingleNoteFingering`・`p7/modularTournament`・`p7/sealedFinal`・`earPractice`・`spellingChange`・`master251/fixedProfileUi` など）出た。assertion の失敗ではなく時間切れで、機械の負荷によるもの（実行時に Chrome 45・node 20 プロセスが残っていた）。FULL の 1 件とは別の環境要因。
- Playwright は Vitest の失敗で FULL が停止したため、この回は走っていない。

**2 回目（2026-11-19 10:17 開始・ユーザーの再実行指示）**

- 非 Playwright: 2 回目もすべて PASS。**Vitest 7048 / 7050 PASS**。
- **Playwright 主パス: 1200 / 1203（既存・条件付き skip 2）で 1 件だけ 30 秒タイムアウト**。`e2e/p12-4-long.spec.ts:190`「playing one key through > "次のキー（おまかせ）" starts a pass in a key that has no record yet」。assertion ではなく `Test timeout of 30000ms exceeded`。
  - 単独実行: **PASS（28.1 秒）**。30 秒の上限に対して元から重いテストで、FULL の同時実行では時間切れになり得る。P23-48 の差分（`e2e/` の写真保存先と P23-48 spec）とは無関係。
  - heavy パスは主パスの失敗で未実行。
- 機械にはユーザーの Google Chrome が 58 プロセス動いていた。負荷による時間切れで、差分の不具合ではない。

### 6-4. 写真の保存先（追記 2）

- 前回の FULL で追跡 PNG が 86 枚変わった原因を、リードの差分 `P23-48-fix-1-追記2.patch` で直した。`e2e/helpers/reportShots.ts`（新）が `UPDATE_REPORT_SCREENSHOTS=1` の時だけ `docs/reports/<path>`、それ以外は `p89-generated/report-screenshots/<path>` を返す。
- 9 本（`p23-41`・`p23-42`・`p23-43`・`p23-44`・`p23-45`・`p23-46`・`p23-47-fix-2`・`p23-47-fix-3`・`p23-47-guided-level-restart-and-header`）の `page.screenshot({ path: "docs/reports/…" })` を `reportShot("…")` に置き換えた。テストの中身は変えていない。
- 前の FULL が書き換えた写真で戻す物は **0 枚**（前回の報告後に戻し済み）。
- 9 本を `npm run test:e2e -- … --project=chromium-desktop` で実行 → **40 / 40 PASS**（32.8 秒）。実行後の `git status --short -- "*.png"` は、**この作業の前から手元にあった未追跡の `docs/reports/assets/voicing-loop-header-width-audit/*.png` 9 枚だけ**で、追跡 PNG の変更・新しい PNG は 0。`npx tsc -p tsconfig.e2e.json` と `npm run lint` も PASS。

## 7. 写真（`docs/reports/p23-48-assets/`）

P23-48-fix-1 で 7 枚を撮り直した。状態は P23-48 と同じ（公開のテキスト入力から「ツーファイブ」Dm7-G7-Cmaj7 と「明るい循環」Cmaj7-Am7-Dm7-G7 の 2 つだけを作り、Vault から Voicing Loop を開いて「続きから」を作る）。実データ・私的な MIDI は使っていない。

| 写真 | 状態 |
|---|---|
| `vl-picker-1440.png` | 「明るい循環」を選んだ進行選び（1440×900）。水色 |
| `vl-practice-1440.png` | 「明るい循環」の練習（1440×900）。1/4・開始前。右手 `#22d3ee`、左手 `#f59e0b` |
| `vl-picker-768.png` | 768×640 の進行選び。「Voicing Loop」の切り替えと VL の印は水色、「続きから ツーファイブ」 |
| `home-1440.png` | ホーム。VL の印・1 週間の棒・「続きから」の印は水色、Bass の棒は薄紫 |
| `vault-1440.png` | Vault の「明るい循環」の詳細。「Voicing Loop で弾く」も「Chord Dojo で覚える」も水色 |
| `dojo-home-1440.png` | Chord Dojo のホーム（今までどおり。左の CD の行は水色） |
| `bass-home-1440.png` | Bass Practice のホーム（今までどおり。左の BP の行は薄紫） |

- 桃紫の画素は 7 枚とも 0（`#ee7fd0` の画素を数えて確認）。Voicing Loop の主ボタンのグラデーションは水色系（`rgb(82, 227, 209)` を含む）で、上の帯の `--lv-accent` は `#42d8c6` のまま。E2E の `toHaveCSS` でも確認している。
- 見本 `handoff/mocks/p23-48/` は桃紫の写真なので、P23-48-fix-1 では比較に使っていない（指示書 0 節）。

## 8. FULL と master

- FULL を 2 回。どちらも非 Playwright は全 PASS で、テストの失敗は 1 件ずつ、しかも**別々の負荷依存の揺れ**だった。
  - 1 回目: Vitest `GuidedCourseView.test.tsx` のフォーカス（単独 12/12 PASS）。
  - 2 回目: Playwright `p12-4-long` の 30 秒タイムアウト（単独 28.1 秒で PASS）。
- どちらも P23-48 の差分に起因せず、直してよい範囲（写真の保存先と報告の文）の外なので直していない。FULL の終了コードは 1 のまま。
- **master へは入れていない**（`master` は `1d5969cc` のまま）。`git merge --ff-only` もしていない。`done/P23-48.md` に「止まった」と書いた。
- 連続の決まりにより、この段で止め、**P23-49・P23-47-fix-4 には進んでいない**。`done/P23-連続-2026-11-19.md` は書いていない（3 段とも終わった時だけ）。
- 追跡 PNG ガード（前回の FAIL）は追記 2 で解消済み。残っているのは、FULL の 12〜14 分の間に機械の負荷で 1 件が時間切れ・フォーカス揺れになる環境要因だけ。

## 9. 注意・未実施

- push、tag、release、EXE 作成はしていない。
- 実機 MIDI での音の確認はしていない（E2E の合成 MIDI と `AudioBufferSourceNode.start` の計数まで）。
- 耳の `C1` の 1 件は、`--repeat-each=5` の同時実行で 1 回だけ出た読み取りタイミングの揺れ（単独 5 回は 5/5 PASS）。不足音の名前（D♭/C♯）の食い違いは `EarRun.tsx` の修正で解消した。

## 10. まとめ

- 音: Chord Dojo の音をホーム・練習・ガイド練習の間だけに絞った。FULL で毎回落ちていた 8 件は PASS。
- 色: Voicing Loop は水色に戻した。Bass Practice の薄紫、Vault の CD の水色、右手の水色は残した。
- 耳: チップの名前を判定の言葉と同じ `D♭` にそろえた。
- 検証: 点検 PASS、4 spec 15/15、耳 34/35（D♭ は 5/5、C1 は単独 5/5）、9 本 40/40、追跡 PNG の変化 0。FULL は 2 回とも負荷依存の揺れ（Vitest のフォーカス / Playwright の 30 秒タイムアウト）で 1 件ずつ FAIL。**master へは未マージ。連続はここで停止。**
