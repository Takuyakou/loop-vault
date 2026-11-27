# P23-49 ガイド練習の「舞台」（基礎コース Lv1〜3 の見本と問題）

- 基点: local master `5dba8bbf`（P23-48 を入れた後）
- ブランチ: `feat/p23-49-guided-stage`
- 状態: 実装・点検・E2E・写真は完了。**FULL は Vitest 1 件（`p21SingleNoteFingering.test.ts` の 30 秒タイムアウト）で FAIL**。連続の追記 3 節の 3 条件（①その段で変えていない・E2E の一覧に無い ②単独 3 回とも PASS ③2 件まで）を全部満たすため、止まらずに P23-47-fix-4 へ進む。**master には入れていない。**
- 指示書: `inbox/P23-49/P23-49-guided-stage.md` → `P23-49-追記.md`（2 件の直し）。計画: `handoff/guided-redesign-plan.md` の段 1。

## 1. 変えたファイル

| ファイル | 変更 |
|---|---|
| `src/views/chord-dojo/guidedStage.css`（新） | 舞台の見た目。`.guided-course[data-stage]` の中だけ。3 つの帯（コード・鍵盤・操作 1 行） |
| `src/views/chord-dojo/GuidedCourseView.tsx` | 見本に `data-stage="demo"`、問題に `data-stage="question"` と `data-result`。判定の文と自動で進む案内を真ん中の帯へ移動。上の帯から MIDI の表示・設定ボタンを削除。鍵盤に `stage` を渡す。P23-49 追記: 次のフレームで問題の文にフォーカスを移す時、窓（`[role="dialog"]`）の中にフォーカスがある時は移さない |
| `src/views/chord-dojo/CourseKeyboard.tsx` | `stage` の時は 176px（窓の高さ 760px 以下は 132px）。`stage` なしは今までどおり 128px |
| `src/views/chord-dojo/courseNoteNames.ts`（新） | 音名を鍵盤の目盛り（真ん中の C = C4）とフラットで書く 1 か所 |
| `src/views/chord-dojo/GuidedBasicPractice.tsx`・`AdvancedCourseView.tsx` | `noteNames` を `courseNoteNames` に（高度コース・自由練習の音名にも効く） |
| `src/views/chord-dojo/GuidedCourseView.test.tsx` | P23-49 追記の単体テスト 1 本（遅れたフレームが窓のフォーカスを奪わない） |
| `e2e/p12-4-long.spec.ts` | P23-49 追記: 「playing one key through」の 4 本に `test.slow()` |
| `e2e/p23-42-guided-course-ui.spec.ts`・`p23-44-guided-flow.spec.ts`・`p23-47-fix-2`・`p23-47-fix-3`・`p23-47-guided-level-restart-and-header` | 仕様が変わった所・形の測り方（下の 2 節） |
| `e2e/p23-49-guided-stage.spec.ts`（新） | 舞台の 13 本（デモ・問題・値の表 5 窓・1280/1024/768・MIDI 無し・耳・変えていない 3 画面） |
| `docs/reports/p23-49-assets/` | 14 枚（見本と同じ 11 枚 + 変えていない 3 画面） |

採点・保存・問題の出し方・音・Enter の操作は変えていない。`data-stage` は基礎コースの見本・問題だけに付き、高度コース・自由練習・結果の画面は今までの札の形のまま。

## 2. 直したテスト（仕様変更・形の測り方）

| ファイル・行 | 前 | 後 | 理由 |
|---|---|---|---|
| `e2e/p23-47-fix-2-answer-feedback.spec.ts` | `"C5 · E5 · A5"` | `"C4 · E4 · A4"` | 音名を鍵盤の目盛り（C4）にそろえた |
| `e2e/p23-47-fix-3-guided-chord-preview.spec.ts` | `"F4 · A4 · C5"` | `"F3 · A3 · C4"` | 同じ |
| `e2e/p23-47-guided-level-restart-and-header.spec.ts` | `course-midi` が「MIDI 未接続」 | `guided-course` の `data-midi` が `"off"` | 上の帯の MIDI 表示を消した |
| 同上 | `course-midi` が「MIDI 接続中」 | `data-midi` が `"on"` | 同じ |
| 同上 | `course-midi` が見える | `course-midi` が 0 個 | 消したことを確かめる |
| `e2e/p23-42-guided-course-ui.spec.ts`（4 サイズ） | 鍵盤の高さが `[120, 128]` | 窓の高さ 760px 以下なら 132、それ以外は 176 | 値の表（舞台の鍵盤） |
| `e2e/p23-44-guided-flow.spec.ts`（1440/768） | カード幅 ≤760・≥700/650 | 鍵盤の幅 1088/672、高さ 176/132 | カードをやめて舞台になった。値の表の数字に置き換え |

直したのは、実際に落ちた行だけ。高度コース・自由練習・結果の確かめは 1 つも変えていない。

## 3. 点検（すべて PASS）

| 点検 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx tsc -p tsconfig.e2e.json` | PASS |
| `npm run lint`（ESLint + class lint + source contracts） | PASS |
| `npm run build` | PASS（既存の chunk 警告のみ） |

## 4. E2E・単体テスト

- 既存のガイド練習 spec + `p12-4-long`: 46 件を実行し、44 PASS。落ちた 2 件は上の表の形の測り方（`p23-42` の鍵盤高さ、`p23-44` のカード幅）で、直した後に **10 / 10 PASS**（14.4 秒）。
- 新しい `e2e/p23-49-guided-stage.spec.ts`: **13 / 13 PASS**（18.4 秒）。
  - 値の表 5 窓（1440×900・1366×768・1280×720・1024×768・768×640）で、上の帯の高さ・コード名の字・鍵盤の幅×高さ・下の帯の高さが ±1px。
  - 待ち・まちがい・次の問題の正解で、鍵盤の上の端が同じ（±1px）。
  - `data-result` が `wrong` / `correct`。`course-auto-advance` は `checkbox` で 38×22、check/uncheck が効く。
- `npx vitest run src/views/chord-dojo/GuidedCourseView.test.tsx`: **13 / 13 PASS**（追記の遅延フレームのテストを含む）。
- 写真は新しい spec を `UPDATE_REPORT_SCREENSHOTS=1` で 1 回回して `docs/reports/p23-49-assets/` に書いた（ふだんは `p89-generated/`）。FULL の前にコミット済み。

### 4-1. FULL

`npm run test:full -- --fresh` を 1 回。

- 非 Playwright: source contracts、AI handoff、phase docs、class lint、runner contracts 40/40、privacy scan、E2E TypeScript、production build、repository ESLint、App TypeScript — すべて PASS。
- **Vitest: 7048 / 7051（既存 skip 2）で 1 件だけ FAIL**。`src/domain/p21SingleNoteFingering.test.ts`「P21 §3 integer weights and long index > above maxCards the hand keeps the old E1-T result」が **30 秒のタイムアウト**（assertion ではない）。
- Playwright は Vitest の失敗で FULL が停止したため、この回は走っていない。
- 連続の追記 3 節の条件:
  1. 落ちたファイルはこの段で変えていない（`src/domain/p21SingleNoteFingering.test.ts`、E2E の一覧にも無い）。✓
  2. 単独で 3 回: **19 / 19 PASS を 3 回**（タイムアウトせず）。✓
  3. 落ちたのは 1 件（2 件まで）。✓
- 3 つとも当てはまるため、指示どおり**止まらずに次の段（P23-47-fix-4）へ進む**。FULL のやり直しはしない。原因は機械の負荷による時間切れで、P23-49 の変更（13 ファイル）とは無関係。

## 5. 写真と見本

`docs/reports/p23-49-assets/`（1440×900 と 768×640 は見本と同じ大きさ）。

| 写真 | 状態 |
|---|---|
| `demo-1440.png` | 見本。`C3 · E3 · G3`、枠の無い 3 つの帯 |
| `q-wait-1440.png` | 問題・待ち。Fm、コード名 112px、下の帯 1 行 |
| `q-correct-1440.png` | 正解（次の問題 Fm で正解、正解の一例 F3 · A3 · C4） |
| `q-wrong-1440.png` | まちがい（3 度を半音上げた）。赤い光、「不正解」、鍵盤の見出しの横に正解の音名 |
| `q-self-1440.png` | MIDI 無し。「弾けた」「まだ難しい」が下の帯の中 |
| `ear-1440.png` | 耳。「根音 F」は 56px。二択は今のまま |
| `q-wait-1280.png`・`q-wrong-1280.png` | 1280×720。上の帯 1 行、コード名 84px、鍵盤 132px |
| `q-wait-1024.png` | 1024×768。1440 と同じ形 |
| `q-wrong-768.png`・`demo-768.png` | 768×640。上の帯 2 行、コード名 72px、鍵盤 132px |
| `lv4-question-1440.png` | 変えていない高度コース Lv4 の問題（前の札の形） |
| `lv5-practice-1440.png` | 変えていない自由練習 Lv5 |
| `result-1440.png` | 変えていない同じ日の結果画面 |

見本との違い（レイアウトの差ではない）:

- 見本は Linux で撮られており、字の形（アンチエイリアス）が違う。
- 見本の上の帯は「合成入力」だけ。こちらは撮影環境の音色（ピアノ）も出る。
- 正解の写真は、見本が 4/20 の E3 · G3 · C4、こちらは 2/20 の Fm（F3 · A3 · C4）。問題の進み方の違いで、形は同じ。
- 耳の写真は「再生中」（試聴の途中）で撮れている。見本は待ちの状態。
- まちがいの「余分な音」の音名は、弾いた音によって変わる（見本 A、こちらは 3 度を上げた音）。

## 6. 注意・未実施

- **master には入れていない**（リードのレビュー待ち）。push、tag、release、EXE 作成はしていない。
- 高度コース・自由練習・結果の画面は舞台にしていない（計画書の段 3 以降）。
- 耳の二択、Lv を選ぶ欄、「このレベルを最初から」、まちがいの ✓/✗、5 問の区切り、地図、合格の線は、この段では変えていない。
- 実機 MIDI での確認はしていない（合成 MIDI と画面の数字まで）。
