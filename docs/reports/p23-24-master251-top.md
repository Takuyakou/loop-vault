# P23-24:2-5-1 Master — 上の行と「12 キーの進み」

- ブランチ:`feat/p23-24-master251-top`(QUEUE の 2 番 P23-21 の先頭 `5f8fd656` から)
- コミット:
  - `bfed0af5` p23-24-01(WIP):上の行・札の行(この時点で K9 が入らず QUESTION)
  - `42732c09` p23-24-02:ANSWER の案 D(札を identity の行へ)・上の行の収め・C1〜C8
  - (この報告)

## 1. 上の行(M1〜M12)

- **M1**:戻る・「2-5-1 Master」。`<small>SPECIAL</small>` を消した。包む `.master251-title` は今のまま。
- **M2**:練習の選びを **3 つ並んだ切り替え**に(`role="radiogroup"`・`aria-label="Masterの練習"`、`role="radio"` の「学習」「復習」「Mixed Test」、`aria-checked`・`data-on`、高さ 28px)。押すと今の `choose(undefined,{kind,form})`。**左右の矢印で隣へ**。
- **M3〜M5**:Form(学習)・範囲(復習)・Mixed の説明は今のまま(Form の選択肢の字も今のまま)。
- **M6**:音域を Form・範囲の**右**へ(disabled の決まりは今のまま)。
- **M7**:段階の説明は音域の右(今の文のまま)。
- **M8**:Form の進み(`master251-form-progress`)=「Form {A}」+ 90×6 の棒 + 「{n} / 12」。学習のときだけ。
- **M9**:「最終 80 BPM · 2拍 × 3コード + 2拍休み」を上の行から外し、48セルを開いた中の**一番上**へ(文は今のまま)。
- **M10**:右端は「48セルの進み具合」→「MIDI 設定」の順。
- **M11**:1440px で上の行は **42px**、中の物の縦の真ん中は 1px 以内。
- **M12**:狭い幅では 2 段(1 段目 = 題・48 セル・MIDI 設定、2 段目 = stage)。

## 2. 12 キーの進み(K1'〜K9'。ANSWER の案 D)

- **K1'**:札は `.master251-identity`(「Form {F} · キー {K}」)と**同じ 1 行**(`.master251-ident-row`、高さ 20px)。
- **K2'**:1 個 = 20px・幅 34px・間 3px・角丸 6px・等幅 10.5px。色・読み上げ・testid は WIP のまま。
- **K3**・**K5**・**K7**:学習済み = アクセントの薄い面+アクセントの字/今のキー = アクセントで塗る/まだ = ふつうの面+薄い字。`role="group"`・`aria-label="Form {F} の12キーの進み"`、1 個ずつ `aria-label`、押せない(span)。testid `master251-keys12`・`master251-key12`(`data-key`/`data-learned`/`data-current`)。
- **K4**:今のキーは問題を出しているときだけ(1 個)。出していないときは 0 個。
- **K6**:Recall でも出してよい(札はキーの名前だけ)。
- **K8'**:identity の字が出ない間も行の高さは 20px のまま(札だけ出る)。
- **K9'**:札を足す前と後で、楽譜・ボタン・鍵盤の位置と大きさが変わらない(下の「4.」の数字)。今の WIP で足した「札の行」は無くした。

## 3. 指示書どおりにできなかった所・見本と違う所

- **K9 で止まった**(WIP `bfed0af5`):1280×720 では練習の面の余りが 4px しかなく、22px の札を入れると 18px 溢れて楽譜が「一時停止（P）」に重なった。`QUESTION.md` に測った数字と案 A〜E を書いた。**ANSWER の案 D** で解決(上の行の 1 行に同居させ、行の高さを増やさない)。
- **上の行を収めるために 2 つだけ小さくした**(K9' を満たすため。見た目の変化は最小):
  - `.master251-title` に `max-width:210px`(1440 で stage に 50px 回す)
  - 切り替えのボタンの左右の余白 10→8px、矢印キー以外は今のまま
- 古い `@container(max-width:900px)` の塊は**今まで効いていなかった**(`.master251` に `container-type` が無かった)。**M12 の 2 段**は、はっきり効くよう `@media(max-width:900px)` で同じ形を書いた(`container-type: inline-size` も足した)。
- 形 B(SPECIAL・最終 80 BPM・並び順)のテスト直しは**不要だった**:`git grep` でその 3 つを確かめているテストは 0 件だった。

## 4. 今あるテストで直した行(形 A)

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `e2e/helpers/p12.ts:8` | (無し) | `chooseMasterPractice(page, kind)` を足した(切り替えの押し方) | A |
| `e2e/p12-2-master.spec.ts:117` | `getByLabel('Masterの練習').selectOption('mixed')` | `chooseMasterPractice(page,'Mixed Test')` | A |
| `e2e/p12-master251-register.spec.ts:26`(2 か所) | `selectOption('mixed')` / `('learning')` | `chooseMasterPractice(page,'Mixed Test')` / `('学習')` | A |
| `e2e/p12-master251-ui-scheduler.spec.ts:21` | `selectOption('mixed')` | `chooseMasterPractice(page,'Mixed Test')` | A |

期待は変えていない。**`e2e/p12-1-dojo-ui.spec.ts` は 1 行も変えていない**(42px・真ん中のテストはそのまま通った)。

## 5. 確かめること

| # | 単体/e2e | テスト |
|---|---|---|
| C1 | e2e | `e2e/p23-24-master-top.spec.ts`「C1/C4: the top row keeps its order, its 42px and its centred items」(M1〜M12 を 1 つずつ)・「C5/C6/C7…」(K1'〜K9') |
| C2 | e2e | 「C2: each switch changes the practice, the arrow keys move, and a reload keeps it」 |
| C3 | e2e | 「C3: Form's progress shows the learning position and only in learning」(3 学習済み → 「3 / 12」・棒 22.5px・復習では出ない) |
| C4 | e2e | 「C1/C4…」(1440 で 42px・真ん中の差 ≤1px) |
| C5 | e2e | 「C5/C6/C7…」(順 = `LEARNING_KEYS`・`data-learned` の数 = 学習済み・今のキーは 1 個) |
| C6 | e2e | 同上(札の字にコード名が入らない) |
| C7 | e2e | 同上(問題が替わる・一時停止・再開で鍵盤の上端 y が変わらない・1440×900/1280×720 で窓の中) |
| C8 | e2e | 「C8: four widths, axe and the keys on the 2-5-1 screen」(4 幅・axe 0・P で一時停止) |

## 6. 幅ごとの数字(C4・C7・C8)

- 1440×900:上の行 **42px**、中の物の真ん中の差 **≤1px**、stage 末尾 1219（右の 48セル 1227・MIDI 1355 と重ならない）
- 1280×720 / 1440×900:鍵盤の下端が窓の中、`#main-content` の溢れ **0**
- 768×640:2 段(題・48セル・MIDI が同じ行、stage が下)、header 104px
- 4 幅とも `body` の横の溢れ 0・axe の serious/critical 0

## 7. 最後の確かめ

```
npm run lint                                             PASS
npm run build                                            PASS(8.38s)
npm run test:fast -- src/domain/master251 src/views/chord-dojo   PASS 6756/6758(86.8s)
npm run test:ui -- <18 spec>                             PASS 303/303(265.7s)
```

取りこぼし:変えた文字(`Masterの練習`)・消した物(`SPECIAL`)・移した物(「最終 80 BPM」)・変えた testid(無し)・部品の種類(select → ラジオ)を `git grep` で洗い、当たった spec を上の一覧に足した(`p12-2-master`・`p12-master251-*`・`p14-midi-connection`)。基準の写真は 2-5-1 Master が写っている物だけ、必要なら更新する(下に書く)。

## 8. FULL

npm run test:full   PASS — 867.5s

| 段 | 結果 |
|---|---|
| Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 / Privacy scan | PASS |
| E2E TypeScript / Production build / Repository ESLint / App TypeScript | PASS(8.6s / 16.3s / 23.5s / 27.9s) |
| Vitest full | PASS 6756/6758(73.3s、2 件は既存の条件つき skip) |
| Gallery | 対象外 |
| Playwright full(軽い方) | PASS 1067/1069(2 件は既存の条件つき skip、532s) |
| Playwright heavy pass | PASS 53/53(261.8s) |
| Git diff check / tracked PNG check | PASS(開き直り 0 回、追跡 PNG の変化なし) |

注意:FULL を回したとき、作業用の一時 spec(`e2e/zz-probe-narrow.spec.ts`・未追跡・1 本)が木に残っていた。軽い方の 1067 はそれを含む(その 1 本も PASS)。報告の前に消した。基準の写真は更新していない(2-5-1 Master の基準の写真は無く、`visual.spec.ts` も PASS)。

## 9. 写真

`p89-generated/p23-24/`(git で追跡しない)。

- 学習・復習・Mixed Test × 1440×900・1280×720・1024×768・768×640 = 12 枚(`master-{learn,review,mixed}-{size}.png`)

## 10. 気づいたこと(直していない)

1. 古い `@container(max-width:900px)` の塊が**一度も効いていなかった**ので、`container-type: inline-size` を `.master251` に足した。狭い幅の見た目が「今までと変わる」可能性がある(指示書は「今と同じく 2 段」と言っているので、意図に合わせた)。
2. 上の行を 42px に収めるため、題に `max-width:210px` を入れ、切り替えのボタンの余白を 10→8px にした。1440 で「最終 80 BPM」が 48セルへ移ったぶんの場所を、札と進みに使っている。
3. `p12-1-dojo-ui.spec.ts` の「42px・真ん中」のテストは**変えずに**通った(確認済み)。
