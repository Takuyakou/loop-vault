# P23-52 報告: コースの地図 ①・結果画面 ⑧・レベル選択の撤去・決まり 1

## 1. 実装内容

- **前線ロジック (`P23-52-logic.patch` + 補完)**:
  - `src/domain/chordDojo/guidedCourse/frontier.ts` / `frontier.test.ts`: 9 駅 (`1..8 | "capstone"`) の状態 (`done` / `due` / `waiting` / `now` / `locked`) を計算する `courseFrontier`。別日確認待ちは最大 2 件まで（1 件待ちの間は次の段が `now`、2 件待ちでその先が `locked`）。
  - `src/domain/chordDojo/guidedCourse/review.ts`:
    - `coursePlan(store, now, { level })`（決まり 1 対応）。
    - `evaluateStoreLevel` を export（周回境界 `rounds` を保ったまま地図から評価するため）。
    - `attemptQualityBreakdown(store, level, block, attemptId)` を追加（`maj / min / maj7 / dom7 / min7 / min7b5` の音楽的な順で種類別の棒を集計。Lv1 や別日確認など `qualityBlocks` が空の確認でも棒を描画可能）。
- **コースの地図 ① (`src/views/chord-dojo/GuidedCourseMap.tsx`, `guidedMap.css`)**:
  - 入口 (`GuidedCourseView`) が基礎ストア・高度ストアの双方を読み込み、9 駅の `courseFrontier` を計算して地図 ① を既定表示。基礎ストア破損時はそのまま隔離画面へ遷移。
  - 黄色の帯 (`course-due`): `due` 駅があるときに「`{駅}` の「別の日にもう一度」ができます」「`{N}問、{M}分ほど`。受かると `{駅}` は修了です。」を表示。「確認を始める」(`course-due-start`) で別日確認へ、「あとで」(`course-due-later`) でこの表示中のみ閉じる。
  - 3 群横並び (`3fr 4fr 2fr`) の 9 駅カード（基礎 Lv1–3 / つなぐ Lv4–7 / 広げ Lv8・総合）と、各段のミニ鍵盤・スピーカー・五線図、状態札（`修了` / `確認できます` / `確認待ち` / `いまここ` / `まだ`）。
  - 下段左の詳細カード (`course-map-detail`): 箇条書き、「この段の響き」試聴チップと 36 鍵盤、`now` / `due` / `waiting` / `done` / `locked` ごとの操作行（`course-map-go`, `course-map-demo`, `course-map-practice`, `course-restart`, `course-map-locked-reason`）。`done` の「このレベルを最初から」は `LevelRestartDialog` 経由。
  - 下段右「修了までの道のり」(`course-map-steps`): 番号付き手順と進捗・合格線。
- **結果画面 ⑧ (`src/views/chord-dojo/GuidedResultSheet.tsx`, `GuidedCourseView.tsx`, `AdvancedCourseView.tsx`)**:
  - 基礎・高度の `block-result` を共通の結果画面 ⑧ へ統一（44px 結果見出し + `合格の線は {P}問`、種類別／部分別の棒、次の 3 箱、主ボタン Enter 対応・2 番目ボタン・3 番目「今日はここまで」で地図へ戻る）。
  - 結果画面から「今日はここまで」や次レベルへ進む前に `clearActiveAttempt` / `clearAdvancedActive` を保存し、地図へ戻った際に完了済み `active` が残らないように整理。
- **`GuidedLevelSelect` の撤去とヘッダー整備**:
  - `GuidedCourseView.tsx` / `AdvancedCourseView.tsx` / `GuidedBasicPractice.tsx` から `GuidedLevelSelect` の import と描画を撤去（`GuidedLevelSelect.tsx` ファイル自体は未削除で残置）。
  - 戻るボタンのラベルを質問・見本・自由練習画面では「コース」（地図へ戻る）、地図では「Chord Dojo」（ホームへ戻る）に変更。
  - 基礎→高度の公式解禁条件を `frontier.states.get(4) !== "locked"` に変更（Lv1〜2 修了・Lv3 今日の確認合格後、別日待ちのまま Lv4 公式が開く）。
  - 768×640 のヘッダー 2 行目 (`.gc-meta`) に `min-height: 34px` を維持し、P23-49 数値表（全 5 サイズ）のトップバー高さを満たした。

## 2. 見本写真との比較 (`docs/reports/p23-52-assets/`)

- 撮影条件: `1440×900`・`1280×720`・`768×640` で M1 (`map-m1-*`), M2 (`map-m2-*`), M4 (`map-m4-*`), M7 (`result-m7-*`) の計 12 枚を取得。全サイズで横はみ出しなし。
- **`ideal-1-map.png` との比較 (`map-m2-1440.png` 等)**:
  - ヘッダー (`< Chord Dojo` + 24px 太字 `ガイド練習` + 説明文)、黄色の帯 (`course-due`)、3 群 9 駅レール、選択枠、詳細カードの「この段の響き」チップと 36 鍵盤、右パネル「修了までの道のり」とも見本と一致。
  - **見本との小さな違い**:
    1. M2 では Lv2 が未着手のため、詳細カード下部は「30問。途中でやめても続きから始められます」＋「始める Enter」（途中経過がある場合は見本どおり区切りバー＋「続きから弾く Enter」）。また、Lv2 の見本は P23-54 で追加予定のため、現段階では Lv2 に「見本を見る」は出していない（Lv1 および Lv4〜8 で表示）。
    2. 1280×720 では高さが 720px のため、詳細カード下端が画面下に自然にスクロールする。
- **`ideal-8-result.png` との比較 (`result-m7-1440.png` 等)**:
  - 44px 見出し「`20問中 19問で合格`」「`合格の線は 18問`」、4 種類の棒 (`maj7 5/5`, `7 5/5`, `m7 4/5` 黄色, `m7♭5 5/5`)、次の 3 箱、横並びボタンが見本と一致。
  - **見本との小さな違い**:
    1. 基礎の 1 試行はコード名 20 問＋耳 10 問をまとめて終える構造のため、結果画面の左の箱に「コード名 19/20 · 耳 10/10」、補足行に「耳から弾く 10 / 10（合格の線 8問）」を表示している。
    2. 間違えた問題が 1 問以上ある場合は既存の間違え問題復習テスト (`p23-47-fix-2`) を維持するため 2 番目ボタンに「間違えた問題だけ練習（N問）」(`course-wrong-practice`) を優先表示し、間違えた問題リストが無い弱い種類の場合に「`{種類}` をもう少し練習する」(`course-weak-practice`) を表示している。

## 3. 既存テストの更新一覧（機械的な変更と決まり 1 による期待変更）

### 3-1. `guided-level-select` 撤去に伴う置き換え

| ファイル | 箇所 | 変更前 | 変更後 |
|---|---|---|---|
| `src/views/chord-dojo/GuidedCourseView.test.tsx` | `restarts basic free practice to the first item` | `guided-level-select` で `"2"` を選択 | 地図で `course-station-2` → `course-map-practice` |
| `src/views/chord-dojo/AdvancedCourseView.test.tsx` | `restarts free practice to the first material...` | `guided-level-select` で `"5"` を選択 | `mountAdvanced({ initialLevel: 5, initialMode: "practice" })` |
| `src/views/chord-dojo/AdvancedCourseView.test.tsx` | `opens basic free practice when Lv1–3 is chosen...` | `guided-level-select` で `"2"` を選択 | 地図で `course-station-2` → `course-map-practice` |
| `e2e/p23-45-advanced-course.spec.ts` | Lv8 3 群表示 / 全レベル到達テスト | `guided-level-select` で 8 / 7 / 2 を選択 | 地図で `course-station-8` / `7` / `2` → `course-map-practice`（全 9 駅存在を確認） |
| `e2e/p23-46-guided-practice.spec.ts` | `chooseLv5` / Lv8 群選択テスト | `guided-level-select` で 5 / 8 を選択 | 地図で `course-station-5` / `8` → `course-map-practice` |
| `e2e/p23-47-guided-level-restart-and-header.spec.ts` | 768 操作行 / Lv8 自由練習やり直し | `guided-level-select` 表示確認・`"8"` 選択 | `guided-level-select` は `toHaveCount(0)`、Lv8 は地図で `course-station-8` → `course-map-practice` |
| `e2e/p23-47-fix-2-answer-feedback.spec.ts` | 自由練習リトライ / Lv4・Lv7 自由練習 | `guided-level-select` で 1 / 4 / 7 を選択 | 基礎は地図で `course-station-2` → `course-map-practice`、Lv4 は開始パネルの練習ハブ、Lv7 は地図で `course-station-7` → `course-map-practice` |
| `e2e/p23-47-fix-3-guided-chord-preview.spec.ts` | Lv5 進行デモ / 基礎・Lv7 自由練習カード | `guided-level-select` で 5 / 1 / 7 を選択 | 地図で `course-station-5` / `2` / `7` → `course-map-practice` |
| `e2e/p23-49-guided-stage.spec.ts` | Lv5 自由練習写真 | `guided-level-select` で `"5"` を選択 | `dojo-back` → 地図で `course-station-5` → `course-map-practice` |
| `e2e/p23-50-advanced-stage.spec.ts` | Lv6 進行カード / Lv2 自由練習 | `guided-level-select` で 6 / 2 を選択 | 地図で `course-station-6` / `2` → `course-map-practice` |

### 3-2. 決まり 1・結果画面 ⑧ に伴う期待変更

| ファイル | テスト名 | 変更前の期待 | 変更後の期待 |
|---|---|---|---|
| `src/views/chord-dojo/GuidedCourseView.test.tsx` | same-day 合格後の待ち | `course-delay-wait` 画面（「翌日かつ 12 時間以上」） | 地図で Lv1 `waiting`・Lv2 `now`、Lv1 選択時に「から別の日の確認ができます」・`course-map-go` なし |
| `src/views/chord-dojo/GuidedCourseView.test.tsx` | same-day 不合格 / 別日合格 | `.gc-panel h2`（「もう一度確認します」/「Lv1 のレベル合格」） | 結果画面 ⑧ `.gc-sheet h2`（「20問中 0問」/「10問中 10問で合格」+ `data-formal="true"`） |
| `src/views/chord-dojo/AdvancedCourseView.test.tsx` | Lv4 不合格 / same-day 合格後 | `.gc-panel h2`「もう一度確認します」/ `advanced-continue` → `advanced-delay-wait` | `.gc-sheet h2`「20問中 17問」/ `advanced-next-level`「Lv5 を始める」→ Lv5 へ |
| `e2e/p23-42-guided-course-ui.spec.ts` | `results:` / `narrow states:` | `course-delay-wait` 画面、`.gc-panel h2` 旧文言 | 決まり 1（地図で Lv1 `waiting`・Lv2 `now`、Lv1 に `course-map-go` なし）、結果画面 ⑧ `.gc-sheet h2` |
| `e2e/p23-45-advanced-course.spec.ts` | Lv4 不合格結果 | `.gc-panel h2`「もう一度確認します」 | `.gc-sheet h2`「20問中 0問」 |

### 3-3. 地図経由の入口・戻るボタン 2 段化の機械的更新

- `home:guide:open` 後に `course-map` → `course-map-go` を追加した spec:
  `p23-40`, `p23-42`, `p23-44`, `p23-45`, `p23-46`, `p23-47-guided-level-restart-and-header`, `p23-47-fix-2`, `p23-47-fix-3`, `p23-47-fix-4-ear-and-sight`, `p23-47-fix-4-ui`, `p23-48`, `p23-49`, `p23-50`, `p23-51`, `p23-53`（および `e2e/helpers/guidedMap.ts` 追加）。
- 戻るボタンでホームへ戻る確認を「コース（地図へ）→ Chord Dojo（ホームへ）」の 2 回に更新した spec:
  `p23-40`, `p23-44`, `p23-47-guided-level-restart-and-header`, `p23-47-fix-4-ui`, `p23-51`。

## 4. 検証結果

### 段階テスト（コミット前）

- `npx tsc --noEmit`: **PASS**
- `npx tsc -p tsconfig.e2e.json --noEmit`: **PASS**
- `npm run lint`: **PASS**
- Vitest (`src/domain/chordDojo/guidedCourse src/views/chord-dojo`): **36 files / 432 passed (0 failed)**（`frontier.test.ts` 6/6 含む）
- Playwright ガイド練習関連 18 spec（`p22-01-home` + `p23-40`〜`p23-53` 全部）: **119 passed (0 failed)**
  - `e2e/p23-52-course-map.spec.ts` (M1–M8): **8/8 PASS**
  - `e2e/p23-49-guided-stage.spec.ts` (1440 / 1366 / 1280 / 1024 / 768 全 5 サイズ数値表): **13/13 PASS**（P23-51 / P23-53 で残っていた 4 件のトップバー高さ超過が解消）

### FULL (`npm run test:full` + `npm run test:e2e`, 対象コミット `c5a8b614`)

- 静的点検 10/10 (**PASS**): Source contracts, AI handoff, Class lint, Phase docs, Runner contracts (40/40), Privacy scan, E2E TypeScript, Production build, Repository ESLint, App TypeScript
- Vitest full: **7,064 passed / 2 skipped / 1 failed**
  - 失敗 1 件は未変更の `src/domain/p21SingleNoteFingering.test.ts`（並列負荷下の 30,000ms タイムアウト）。単体 3 回連続実行で **3/3 PASS**（各 19/19, 約 21.7s）。
- Playwright full (`npm run test:e2e`): **1,305 passed / 2 skipped / 2 failed**
  - ガイド練習関連（`p23-40`〜`p23-53`、`p23-49` 全 5 サイズ数値表、`p23-52` M1–M8 含む）は **全件 PASS（0 failed）**。
  - 失敗 2 件はいずれも未変更ファイルの並列負荷起因フレーク:
    1. `e2e/dojo-display-judge.spec.ts:235` (`MIDI reconnect during tempo clears the old input Target and a new round accepts all answers`)
    2. `e2e/p16-ear-keyboard.spec.ts:45` (`768×640: 白鍵の縦横比が 1:3.5〜1:4.5...`)
  - 上記 2 spec を単体 3 回連続実行し **3/3 PASS**（各 14/14）を確認。
