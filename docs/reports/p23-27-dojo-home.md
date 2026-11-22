# P23-27:Chord Dojo のホーム(2 列)

- ブランチ:`feat/p23-27-dojo-home`(QUEUE の 6 番 P23-17 の先頭 `2fe67d37` から。`READY.txt` の「master に merge: P23-25」は `b032215c` に含まれることを確認)
- コミット:
  - `a2ed005e` p23-27-01:2 列のホーム(続きからの帯・左の 4 枚の札と絵・右の 4 枚)・C1〜C4・写真
  - (この報告)`p23-27-02`
- 見本:`handoff\mocks\p23-more-mock.html` の「① Chord Dojo のホーム」。色・左メニュー・上の帯は今の土台(`--dojo-*`・`--lv-*`)のまま。

## 1. やったこと(番号ごと)

- **H1**:全体を 2 列に。左 = 「続きから」の下に「よく使う練習」の大きい札 4 枚(2×2)、右 = 幅 330px の列。「続きから」と MIDI の注意は 2 列の上に幅いっぱい。
- **H2**:「続きから」を 1 本の帯に。左に `CD` の印、小さい字「続きから」、題(`dojoRecentTitle`)と薄い字(`dojoRecentSubtitle`)。右に「ほかの最近:」+ 最近 2 つ(`home-recent-0/1`)、主のボタン「続ける」+ 中の `Enter` の札(`home-resume-go`・`data-primary`)。高さは 58px(min-height、見本の 64px ほど)、角丸 14px、アクセントの細い枠。今の「Enter でも続けられます」の文はボタンの中の `Enter` の札に置き換えた(名前は「続ける」のまま)。
- **H3**:MIDI の注意は太さ 34px ほどの 1 行。文・「MIDI 設定」・「×」・出す決まりは今のまま。2 つ以上出るときは行を重ねる(今のまま)。
- **H4**:大きい札 4 枚(`.dojo-home-p20-main` の中、4 つ・testid・`Master251Card` はそのまま)。1 枚 = 左に絵(幅 130px・角丸 10px・暗い面)、右に題(17px・押すと今の入口)と右端の「›」、説明、大きい数字(等幅 22px)と小さい説明、進みの細い棒(数字があるときだけ)、入口のリンク。字は切らない。
- **H5**:絵は SVG(`dojoHomeArt.tsx`、`aria-hidden`)。定番 = 役割の色の線つきのコード 3 つ(Dm7・G7・C△7)とキーの名/2-5-1 = 4 行 × 12 の四角を**今の 48 セルの状態で塗る**(MASTER = アクセント・合格 = 薄いアクセント・学習中 = 注意の色・まだ = 暗い)/耳 = 丸い聴くボタンと輪・「Am7 ? ?」/ドリル = 小さい鍵盤(4 つ塗る)と時計。
- **H6**:2-5-1 Master の札は `Master251Card` のまま(`home` の props を足して、このホームでだけ H4 の形に)。中の「2-5-1 Master 続きから」・Form のボタン・`master251-continue` の高さ 44px 以上は今のまま。
- **H7**:右の列(`.dojo-home-p20-sub` の中、4 つ・testid はそのまま)。上から:
  - **今日のおまかせ**:題「今日のおまかせ」+「目安 n 分」/`dojo-theme` の文/流れの 4 つ(復習・型・登録した音・進行)と数を 4 つの小さい箱で/「始める」(`practice-start`、**塗りつぶしにしない**)と「中身を見る」(`home-today-details`)/開いた中身(`home-today-details-body`)は今のまま、この札の中で下に伸びる。
  - **コードの型**:題と `homeShapeLabel`、右に「一覧 ›」(onShape)。12 のキーの箱(`DojoKeyGrid`)と、下に色の意味の 1 行。
  - **自分の進行**:1 行(題・「Vault の進行で練習 ・ n 件」・「›」)。
  - **登録した音**:1 行(題・「使いたい n」・「›」)。使いたい音(`home-wanted-item`)は今と同じく 2 つまで、その行の下。
- **H8**:「よく使う練習」の見出しの右に薄い字「押すと開きます」。「そのほか」の見出しは無くした。
- **H9**:1440×900・1920×1080 で縦にスクロールしない(p12 の門で確認)。1280×720・1366×768 は縦に動いてよいが横にはみ出さない・札が重ならない・字が切れない。1024px 未満は右の列を下に回す(`@media (max-width:1023px)`)。

**変えない物**:記録の読み書き(ホームは書かない)、入口の働き、Enter、焦点の戻し(`data-focus-key`/`data-focus-fallback`)、ほかの画面。

## 2. 見本と違う所・指示書どおりでない所

- **小さい字の色**:C4 の axe が 1366px で serious(color-contrast)を出したので、**このホームの中だけ** `--dojo-muted` と `--dojo-secondary` を明るくし(`#b3c0cd` / `#ccd7e2`)、リンクの字も `#c3cfdb` にした。見た目の色は少し明るいが、今の土台の変数の中での変更。
- **続きからの帯の高さ**:見本の 64px ほどに合わせて min-height 58px(中のボタンは 44px)。写真で 58〜66px に収まる。
- **P22-01 の門の決まりを新しいホームに合わせた**(B)。「8 枚の札の題は 14px で 1 つ」→ H4 の 17px(大きい 4 枚)/14px(小さい 4 枚)。「4 枚の練習の札は 1 行」→ H1 の 2×2。今日のおまかせの札は H7 の 2 つのボタン(始める・中身を見る)なので、札全体 1 つの当たり判定ではなくなった(ほかの 7 枚は今のまま)。
- **visual の基準**:Dojo の `practice.png` を新しいホームに合わせて更新した(この画面の見た目を変える指示のため)。

## 3. 今あるテストで直した行(A・B)

| ファイル | 前 | 後 | 形 |
|---|---|---|---|
| `e2e/p22-01-home.spec.ts`(cards の並び) | 今日のおまかせの primary = `.dojo-card-primary` | `practice-start`(H7)・`wholeCard: false` を足した | B |
| 同上(1 つだけ塗る) | 札の primary の背景が透明 | 帯の主のボタンの色と違う(今日の始めるは面の色) | B |
| 同上(当たり判定) | 8 枚とも札全体で 1 つの入口 | 今日のおまかせは 2 つのボタンなので飛ばす(ほか 7 枚は今のまま) | B |
| 同上(札の空白) | 自分の進行・登録した音の `p:first` | `.dojo-home-one-line > span` の 1 つ目(1 行の札になった) | B |
| 同上(4 枚の並び) | 4 枚が 1 行・同じ高さ・同じ題の行 | 2 行(2×2)・行ごとに同じ高さ。題の行とリンクの行の 1 行揃えは、Master251Card の中身が別なので見ない | B |
| 同上(8 枚の題) | 8 枚とも 14px・同じ大きさ・練習の 4 枚は同じ高さ | 大きい 4 枚 17px・小さい 4 枚 14px・太さは 1 つ | B |
| `e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png` | 前のホームの写真 | 新しいホームの写真 | B |

## 4. 確かめること(C1〜C4)

| # | 単体/e2e | テスト |
|---|---|---|
| C1 | e2e | `e2e/p23-27-dojo-home.spec.ts`「C1/C2: the two columns…」(H1〜H8 を 1 つずつ) |
| C2 | e2e | 同上(2-5-1 の絵の 48 の四角の `data-state` の数と「N / 48」の N が一致) |
| C3 | e2e | 「C3: every old entry is still on the home and pressable」(27 の入口を 1 つずつ、見える・押せる・ほかに隠されていない)。実際に開く所は今の `p20-dojo-home`・`p22-01-home`・`p12-*` が今のまま通る |
| C4 | e2e | 「C4: four sizes…」(4 幅で横にはみ出さない・axe serious/critical 0・Tab の順が 帯 → 左 → 右)・`e2e/accessibility.spec.ts`・`keyboard.spec.ts`・`responsive.spec.ts` |

## 5. 大きさごとの数字

- 1440×900・1920×1080:縦のスクロール 0(p12 の門)。1920 は `max-width:1440px` で中央。
- 1280×720・1366×768:横のはみ出し 0・札の重なり 0・字の切れ 0。縦は動いてよい。
- 768×640:右の列が左の下に回る(media 1023px)。横のはみ出し 0。
- 4 幅とも axe の serious/critical 0(上の色の直しの後)。

## 6. 最後の確かめ

```
npm run lint                                                           PASS
npm run build                                                          PASS(8.50s)
npx eslint e2e/p23-27-dojo-home.spec.ts e2e/p22-01-home.spec.ts        PASS
npm run test:fast -- src/views/chord-dojo                              PASS 6782/6784(135.7s)
npm run test:ui -- <dojo-home を含む 15 spec + p23-27 + visual/accessibility/keyboard/responsive>
                                                                       PASS 293/293(216.3s)(色の直した後の再確認も PASS)
```

## 7. FULL

`npm run test:full` を 1 回だけ回した。**FAIL — Playwright full で 1 件**(1088 passed / 1 failed、11.4m。heavy はその手前で回らず)。

- 落ちたテスト:`e2e/phase5.33-voicing-rule-ui.spec.ts:315`「P5.33 paused card seek persists through resume and keeps MIDI on the second transport row」
- 出た文:

```
expect(locator).toHaveAttribute(expected) failed
Expected: "step"
Received: ""
  > 315 |   await expect(lastCard).toHaveAttribute("aria-current", "step", { timeout: 10_000 });
        at e2e/phase5.33-voicing-rule-ui.spec.ts:315:26
FULL: FAIL — Playwright full exited 1
```

- Vitest full 6782/6784・Production build・Repository ESLint・App TypeScript・Privacy scan・Runner contracts 40/40・Source contracts・Class lint・Phase docs・E2E TypeScript は PASS。

### 7.1 この 1 件の調べ(QUEUE の「ただ 1 つ」の決まり)

- 落ちた spec はこの指示書で触えたファイルと関係ない(`git diff --name-only 2fe67d37..HEAD` = Dojo のホームの 4 ファイル・報告・`p22-01-home`・visual の基準だけ。`ProgressionVoicingPracticeView` など Voicing Loop の画面は触っていない)。
- 同じ spec・同じ症状の記録が既にある:`docs/reports/test-slim-2026-11.md` に「`phase5.33-voicing-rule-ui.spec.ts`「paused card seek persists through resume…」は同じコードを 6 並列で 12 回繰り返すと 4〜5 回失敗(変更前のコミットでも同じ)。FULL でも 1 回落ちた。製品側の競合の疑い(一時停止中のシークでカードの現在位置 `aria-current` が更新されないことがある)」と、`docs/reports/r-01-test-hygiene.md` に同じ spec の記録がある。
- この spec だけを **今のブランチ**で 1 回:**9/9 PASS**(38.1s)。**master `b032215c`** でも 1 回:**9/9 PASS**(44.6s)。
- 上の決まりどおり「照れ」として扱い、**FULL は FAIL のまま記録**して次の指示書(P23-28)へ進む。テストは直していない・回し直していない。

## 8. 気づいたこと(直していない)

- Master251Card はホームの中だけ H4 の形(`home` props)。ほかの画面では今の形のまま(使っている所はこのホームだけなので、実質この 1 か所)。
- 右の列の「今日のおまかせ」は、中身を開くと札が下に伸びる(今のまま)。2 列になったので、開いたときに左の列は動かない。
- `master251-continue` は今のコードに無い(以前の名前)。高さ 44px 以上の門は帯の「続ける」(44px)と `practice-start`(36px のボタンだが、門は「主のボタン」だけ)で満たしている。
