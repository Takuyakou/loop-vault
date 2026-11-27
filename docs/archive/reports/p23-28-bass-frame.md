# P23-28:Bass Practice の練習の枠

- ブランチ:`feat/p23-28-bass-frame`(QUEUE の 7 番 P23-27 の先頭 `f6662ac7` から)
- コミット:
  - `a74fe5a1` p23-28-01:上の行を 1 行に・枠の中の見出しを描かない・段を番号つきの流れに(F1〜F3)
  - `750a4cf4` p23-28-02:キーを「?」へ・箱の形をそろえる・練習ごとの 7 日・持ち越しの 2 つ(F4〜F8)
  - `9ff511e5` p23-28-03:枠の e2e(C1〜C6)と写真
  - `f10d44aa` p23-28-04:1 段目で消えていた Rhythm の説明の確認を戻す・紛れた BOM を落とす
  - `309c4b66` p23-28-05:Chord Context と録音時の伴奏も同じ角丸と面に(F7)
  - (この報告)`p23-28-06`
- 見本:`handoff\mocks\p23-more-mock.html` の「② Bass Practice の練習の枠」。色・左メニュー・上の帯は今の土台(`--lv-*`)のまま、紫だけ Bass Practice の物(`--bh-accent` = `#a79cff`)を `--bp-accent` として共有。

## 1. やったこと(番号ごと)

- **F1**:上の行(`.bass-modebar`)を 1 行に。左から「‹ Bass Practice」(`.bass-mode-back`)・練習の名前(`.bass-mode-name`・19px)・札(`.bass-mode-badge`、`data-midi-feedback` は残す)・薄い字の説明(`.bass-mode-desc`、練習ごとの `MODE_INFO`)・空き・設定の札(`.bass-mode-tools` の Chip、働きは今のまま)・「?」(`Popover label="キー操作"`、見える字は「?」)。2 段目の `.bass-settings-shortcuts` は無くした。1100px 以下で説明を隠し、768px では右の 2 つが次の行へ折れる(帯 70px)。
- **F2**:`EchoPracticeHeader` は `useEchoFramed()` が真なら `null`。枠の外で使う所は今のまま。`kicker`・`title` の props は残した(枠の外の呼び出しが使う)。
- **F3**:`EchoPracticeProgress` を番号つきの流れに。1 段 = 22px の丸 + 名前、段の間に細い線(空の `<li class="bass-echo-line" aria-hidden>` を挟んで伸ばす)。今の段 = 紫の面(`--bp-accent-soft`)+ 紫の丸、済んだ段 = 丸に紫の字、これからの段 = 薄い字。番号は CSS の `content: attr(data-no)` のまま(`textContent` に数字を入れない)。押せない `<ol>`・`aria-label`・`aria-current="step"` は今のまま。
- **F4**:右の欄の箱を同じ形に(角丸 14px・面 `--lv-surface`・中の余白 14px・見出し 14px)。数字が並ぶ箱(Degree Echo の「セッション」)は 2 列の小さい箱(角丸 10px・面 `--lv-well`・114×50)。見出しの言葉は「セッション」のまま。箱が沈まないよう、右の欄の地は塗らない(左の細い線は今のまま)。
- **F5**:Degree Echo の右の欄の「キーボード操作」の箱を消し、その文(`Space 次へ · R もう一度聴く · H ヒント · S 歌う · 1–4 評価 · N 次の問題 · T 移調 · Esc 停止`)を「?」の中に **mode === "degree" のときだけ**足した(共通の 1 行の下)。
- **F6**:右の欄の一番下に「{練習の名前} のこの 7 日」(`testid="bass-mode-week"`)。Degree・Rhythm・Root Motion・Bassline の 4 つだけ(MIDI は足さない)。値は `homeData.info[mode]?.week`(選ぶ画面の札と同じ・新しい記録は作らない)。7 本の細い棒(幅 10px・高さ 52px)+ 曜日、今日 = 濃い紫の地に白い字、0 回の日は棒を出さない、全部 0 なら「この 7 日は、まだ弾いていません」。出し方は `EchoRail`(ポータル)で練習の後ろに置き、`order:99` で欄の一番下に固定(あとから録音の箱が増えても下)。
- **F7**:練習の中の大きい箱(課題の箱・フレットボード・`bass-echo-task`)を F4 と同じ角丸 14px と面 `--lv-surface` にそろえた。Bassline Echo の中の「Chord Context」と「録音時の伴奏」の箱は、`bass-echo-box` を付けて同じ形にした。中の並び・大きさ・働きは変えていない。
- **F8-1**:練習の画面で左メニューの「Bass Practice」を押すと選ぶ画面に戻る。App が「練習を名指ししない開き直し」を数え(`bassHomeRequest`)、`BassPracticeModeView` がその増加を見て `showHome` を真にする(練習は今までどおり裏で生きている)。
- **F8-2**:選ぶ画面を開いて何も練習せずに離れたとき、空の「途中でやめた」を記録しない。**直す前の動き**(実測):選ぶ画面を開いた時点で `sessions 1 / abandoned 0 / attempts 0`、ホームへ離れると **`sessions 1 / abandoned 1 / attempts 0`**(`completedAt` 付き)。直した後:離れても `sessions 1 / abandoned 0 / attempts 0`。直し方は「Degree のセッションが最初の段(設定)から動いたときだけ `onSessionAbandoned` を呼ぶ」で、記録の形は変えていない。実際に練習を始めて(「練習を準備」)から離れたときは今までどおり `abandoned 1` になる。

**変えない物**:選ぶ画面・5 つの練習の中身と働き・記録の形・録音・キー。

## 2. 見本と違う所・指示書どおりでない所

- **今日の札の地色**:表 F6 は「今日 = 紫・白い字」。紫 `#a79cff` の上に白い字は 4.5:1 に届かず、C6 の axe が `color-contrast`(serious)を出した。今日の札だけ濃い紫(`--bp-accent-deep` `#5a4fcf`、白との比 6.1:1)にして、紫・白い字のまま読めるようにした。棒の色は `--bp-accent` のまま。
- **棒の高さ**:記録は日ごとの「やった/やらない」だけ(選ぶ画面の札と同じ値)なので、棒は同じ高さ(52px いっぱい・幅 10px)。見本は回数で高さが変わるが、回数は `bassHomeData` の練習ごとの値に無い(新しい記録を作らない決まりのため)。
- **右の欄の地**:見本はページの地の上に箱が載る。今の欄は面を塗っていたので、箱(`--lv-surface`)と同じ色になって沈む。欄の地を透明にした(色そのものは今の土台のまま)。
- **週の箱の見出し**:見本にある小さい字「弾き終えた回数」を入れた。1440px では箱の幅 265px で 2 行になる。
- **段の線**:見本は札の間で線が伸びる。`<ol>` の中に空の `<li>`(`.bass-echo-line`)を挟んで伸ばした(文字は増えない・押せない・`aria-label`/`aria-current` は今のまま)。
- **段の番号**:`content: attr(data-no)` のまま(1 段目の決まりを保つ。既存テストが `textContent` で段の文を比べているため)。
- **上の帯の高さ**:1440/1280/1024 は 34px の 1 行。768 は 70px の 2 行(F1 の「それでも足りなければ右の 2 つを次の行へ折る」どおり。横にはみ出さない)。

## 3. 今あるテストで直した行(A・B)

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `e2e/p23-25-bass-practice.spec.ts:258`(キーの札) | `.bass-settings-shortcuts` の「キー操作」 | `.bass-mode-tools` の「キー操作」(F1 で 2 段目が無くなった) | A |
| `e2e/phase13-1-bass-ui.spec.ts:138`(設定とキーの札) | `.bass-settings-shortcuts` の「4弦」 | `.bass-mode-tools` の「4弦」 | A |
| `e2e/phase13-1-bass-ui.spec.ts:165`(入力の色) | 同上 | 同上 | A |
| `e2e/phase5.18-chord-context.spec.ts:11`(練習の名前) | `heading "Degree Echo"` | `.bass-mode-name` が「Degree Echo」(F2 で枠の中の見出しが消えた) | A |
| `e2e/phase5.18-chord-context.spec.ts:43`(Rhythm の説明) | `rhythm` の中に「リズムを聴き、…」 | `.bass-mode-desc` に同じ文(F1 で説明が上の帯へ移った。期待の文は変えていない) | A |
| `e2e/p23-25-bass-practice.spec.ts:260`(キーが同じ) | `expect(homeKeys).toBe(practiceKeys)` | 「?」の 1 行目が選ぶ画面の文と一致し、その下に Degree の文(`Space 次へ · … · Esc 停止`)が入る(F5 で Degree の文が「?」へ移った) | B |

`.skip`・`.only`・retry・待ち時間の延長は使っていない。

## 4. 確かめること(C1〜C6)

| # | 単体/e2e | テスト |
|---|---|---|
| C1 | e2e | `e2e/p23-28-bass-frame.spec.ts`「C1 (F1-F7): the frame of all five practices」— 5 つの練習で F1(1 行・19px・札・説明・設定の札・「?」)・F2(枠の中に `lv-section-kicker` 0・h2 に名前なし)・F3(段の数・線の数・`aria-current` 1 つ・番号は `::before` の `"1"…`・今の段の面と丸の色)・F4(箱の角丸 14px/面 `rgb(17,27,42)`/余白 14px/見出し 14px・Degree の小箱 4 つが 2 列で 10px 角丸・`--lv-well`)・F5(「キーボード操作」0・Degree だけ Degree の文)・F6(7 本の棒と 7 つの曜日・今日・欄の一番下)・F7(大きい箱の角丸と面) |
| C2 | e2e | 同上「C2: the top band stays on one line at 1440 and 1280…」— 1440/1280 で戻ると「?」の上端の差 ≤4px・帯の高さ ≤48px、1024/768 も横にはみ出さない(4 幅 × 5 練習) |
| C3 | e2e | 同上「C3: the practice's name is printed once」— 4 つの練習で、画面に出る練習の名前は上の行の 1 つだけ(枠の中の見出しは描かれない) |
| C4 | e2e | 同上「C4: the picker's card and the practice's own 7 days show the same value」— 記録なしで両側とも 0 と「まだ弾いていません」、Degree を 1 回終えると両側とも 1 日・今日の札が紫に白 |
| C5 | e2e | 同上「C5 (F8-1): the left menu's Bass Practice comes back to the picking screen」(5 練習)・「C5 (F8-2): opening the picking screen and leaving writes no empty 「途中でやめた」」(開く前 0/0/0 → 開いた後 1/0/0 → 離れた後 1/0/0 → 練習を始めて離れると abandoned 1) |
| C6 | e2e | 同上「C6: axe is clean and the practice's keys still work」(5 練習で axe serious/critical 0・横のはみ出し 0・Space で次へ・Esc・「3」で自己評価が記録される)。流れそのものは今ある `phase13-1-bass-ui`・`phase13-bass-practice`・`phase5.16〜5.22`・`p23-25`・`p23-06b`・`bass-recording-integrity` が今のまま通ることで確かめた |

写真:`p89-generated/p23-28/`(git 追跡外)—— 5 練習 × 1440×900(Degree・Rhythm・Root Motion・Bassline・MIDI)+ Degree と Bassline × 1280×720・1024×768・768×640 = 11 枚。

## 5. 大きさごとの数字

- **1440×900**:上の帯 y100〜134(34px)・戻る x256〜394・名前 x402〜520(高 23)・札 x528〜736・説明 x744〜1165・設定と「?」 x1173〜1416。本体 x256〜1416(1160)= 左 846 + 右 300。右の欄の箱は幅 265(「セッション」167 高・小箱 114×50 が 2×2・週の箱 265×173、棒 237×52)。大きい箱 836×425(課題)・836×322(フレットボード)。
- **1280×720**:上の帯 1000×34(同じ並び)。本体 1000 = 686 + 300。週の箱 265×173。大きい箱 676×425・676×322。
- **1024×768**:右の欄が本体の下へ回る(`max-width:1100px`)。本体 911 = 左 911 + 欄 911(下)。週の箱 877×150(見出し 1 行・今日の札 118×16)。大きい箱 901×425・901×322。横のはみ出し 0。
- **768×640**:上の帯 70px の 2 行(戻る x80〜218・名前 x226〜344・札 x352〜560 / 2 行目に設定と「?」 x509〜752)。本体 672、週の箱 638×150。横のはみ出し 0。
- 4 幅とも axe の serious/critical 0・`body` の横スクロール 0。

## 6. 最後の確かめ

```
npm run lint                                                           PASS
npm run build                                                          PASS(8.56s)
npx eslint . (e2e まで)                                                 PASS
npx tsc -p tsconfig.e2e.json / npx tsc                                  PASS
node scripts/lint-tailwind-classes.mjs / lint-source-contracts.mjs      PASS
git diff --check master...HEAD / git diff --check HEAD                  PASS
npm run test:fast -- src/features/bass-practice                         PASS 6782/6784(111.9s)
npm run test:ui -- <bass・phase13・phase5.16〜5.22 の 15 spec + p23-28 + responsive/visual/keyboard/accessibility>
                                                                        PASS 95/95(100.3s)
npm run test:ui -- e2e/p23-28-bass-frame.spec.ts                        PASS 8/8(61.9s)
```

`test:ui` の 18 spec:`accessibility`・`bass-recording-integrity`・`keyboard`・`p22-03-home`・`p23-06b`・`p23-25`・`p23-28`・`phase13-1-bass-ui`・`phase13-bass-practice`・`phase5.16-production-activation`・`phase5.16.1-degree-echo`・`phase5.17-record-compare`・`phase5.18-chord-context`・`phase5.19-root-motion`・`phase5.20-text-progression`・`phase5.22-source-bassline-practice`・`responsive`・`visual`(指示書の名前の 15 本と `responsive`・`visual` を含む)。

## 7. FULL

`npm run test:full` を 1 回だけ回した(`2026-11-15T06-15-37-526Z`)。**FAIL — Playwright full で 2 件**(1095 passed / 2 failed・10.4m。heavy は回らず)。

- Vitest full:PASS 6782/6784(89.8s)
- 点検の段:Source contracts・AI handoff・Class lint・Phase docs・Runner contracts・Privacy scan・E2E TypeScript・Production build・Repository ESLint・App TypeScript すべて PASS
- Playwright full:FAIL 636.6s

落ちた 2 件はどちらもこの指示書が変えたファイルと無関係(`git diff --name-only f6662ac7..HEAD` に、耳の練習の画面・Voicing Loop の帯のファイルは無い)。QUEUE の「ただ 1 つ」の調べを 2 件とも行った。

| # | テスト | 出た文 | 単独(今のブランチ) | 単独(master `b032215c`) | 過去の記録 |
|---|---|---|---|---|---|
| 1 | `e2e/p16-ear-keyboard.spec.ts:45`「P16: 鍵盤が縦長にならない 768×640…」 | `expect(ratio).toBeGreaterThanOrEqual(3.5)` — Received `3.1234569372227488` | 9/9 PASS(この spec の 4 つの窓すべて。768×640 は比 3.84) | 9/9 PASS(768×640 は比 4.21) | `docs/reports/p23-23b-ear-result.md:95`(6 本同時の負荷で 1 回落ち、単独では通った) |
| 2 | `e2e/p5-26-2-overview.spec.ts:58`「the window follows the roll's scrolling, and a click or drag on the strip moves the roll」 | `expect(await scrollLeft(page)).toBeGreaterThan(from)` — Expected `> 1524` / Received `1524` | 11/11 PASS(この spec 6 件) | 11/11 PASS | `docs/reports/p23-04-chord-names.md:266`(同じ行・同じ 1524 で FULL だけ落ち、単独 6/6 PASS)・`docs/reports/p20-dojo-home.md:116`(負荷時に同じ spec が落ち、単独では通る)・`docs/reports/test-stability-2.md:23`(この spec のスクロール待ちの直しの記録) |

- 単独の回し方は 2 件とも `node scripts/run-playwright-visual-tests.mjs <spec>`(FULL と同じ fixture 付き build)。
- 決まり(両方で通れば「揺れ」として記録して次へ)に従い、**直さず・回し直さず**、FULL は FAIL のまま記録して 9 番へ進む。
- 2 件とも「負荷(6 本同時)のときにだけ落ちる」型で、症状も既存の記録と一致している。**製品側の直しはしていない。**

## 8. 気づいたこと

- 1 段目(`a74fe5a1`)の `e2e/phase5.18-chord-context.spec.ts` の直しが、コメントの中に `` `r`n `` を混ぜて **Rhythm の説明の確認を丸ごとコメントにしてしまっていた**(テストは通るが、確かめていない)。`f10d44aa` で 2 行に戻した。同じ形の混入を `git grep '`r`n'` で探し、他には無いことを確かめた。
- 1 段目で 3 つの spec の先頭に BOM が入っていた(`ef bb bf`)。`f10d44aa` で落とした(中身は変えていない)。
- `p23-06b` の E5 は、`npm run test:ui`(fixture 付きで build する)では通るが、`npx playwright test` を素で叩くと(fixture 無しの dist で)Voicing Loop の選ぶ画面が出て落ちる。テストの失敗ではなく走らせ方の違いなので、確かめは決まった `npm run test:ui` で行った。
- Degree Echo の「?」は、共通の 1 行 + Degree の 1 行の 2 行になった。選ぶ画面の「?」は 1 行のままなので、`p23-25` の「キーが同じ」の確認を B で書き換えた(上の表)。
- FULL の 768×640 でだけ耳の鍵盤の比が 3.12 まで縮んだ。単独では 3.84(ブランチ)・4.21(master)で、**負荷のときだけ**測る高さが 20px ほど小さくなる型。今のブランチは QUEUE 2〜5 番(耳の段)の変更を含むため master より鍵盤が 11px 低いが、どちらも 3.5 より上で、この指示書は耳の画面を触っていない。直さず記録だけ残した。
