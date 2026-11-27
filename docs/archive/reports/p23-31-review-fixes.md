# P23-31 QUEUE のレビューの直し(見本に合わせる 4 画面)

- ブランチ:`fix/p23-31-review`(master `ebb2675d` から)
- コミット:
  - `092addd6` p23-31-01 pre-analysis matches the mock(P1〜P7)
  - `53c29921` p23-31-02 master251 title is never cut(M1)
  - `88585219` p23-31-03 dojo home cards match the mock(D1〜D5)
  - `13ca1f74` p23-31-04 picker shows degrees and role colours in tests(V1・V2)
  - `86b79495` p23-31-05 the photos of the four screens(`p89-generated/p23-31/`)
  - `2518fa04` p23-31-06 the sounding-line tests follow P6(形 B)と基準の写真 2 枚
  - `325ebc17` p23-31-07 取り込み前の確認のロールの高さを記録
  - `a8609bf8` p23-31-09 600px 未満は札を 1 列に(FULL で見つけた 480px の不具合)
  - (この報告)
- 見本:`handoff\mocks\pre-analysis-adopted-mock.html`・`handoff\mocks\p23-more-adopted-mock.html` の ①③。写真:`p89-generated\p23-31\`(15 枚。git で追跡しない)。

## 1. 取り込み前の確認(P1〜P7)

| # | やったこと |
|---|---|
| P1 | 3 段を `lv-capture-step-n` と同じ見せ方に:終わった段 = 丸に ✓(アクセント)、今の段 = アクセントの枠の札 + アクセントの丸に「2」+ 太字、まだ = 線だけの丸に「3」。段の間は 16px の線。**見える「（今ここ）」は無くした**(`aria-current="step"` はそのまま) |
| P2 | 「混ざったパートの扱い」を 1 行に(高さ 36px):左にその札と小さい「?」、右に 28px の「分けない\|アプリに任せる」。見出しの文は `sr-only` の `h4` に残して `aria-labelledby`、説明 `#pre-analysis-mix-note` は DOM に残して `aria-describedby`。「?」に乗せる・焦点を当てる・押すと吹き出しで出る |
| P3 | 「パート n つ」の下に薄い 1 行「色を見て、役割が合っているか確かめてください。…」(見本と同じ。前回の役割の案が出ているときは、その案が場所を使う) |
| P4 | 役割のボタン:選ばれている物は**塗りつぶさず**、役割の色の 1px の枠 + その色の字 + その色 18% の面。「使わない」の字だけは 4.5:1 に届くよう役割の色を 55% 混ぜた |
| P5 | ピアノロールを薄くするのは**行にマウスが乗っている間と、キーで行に焦点が来た間(`:focus-visible`)**だけ。行を `tabIndex=0` にし、焦点が来ても `:focus-visible` でなければ光らせない(マウスで押しただけでは薄くならない) |
| P6 | 再生の行のすぐ下に「鳴っている音 C3 ・ E4 …」の行。今の再生位置(止まっているときは線の所)の音を低い順・最大 6 つ・♯/♭ の書き方で。無いときは「—」。**「使わない」と目のボタンで隠したパートの音は入れない**(`soundingLineIndex` を新設)。止めた後もその場所の音を出す |
| P7 | 下の帯:注意は左、**「詳しい設定」を「解析する」のすぐ左**に(間 10px)。間にあった伸びる余白を外した |

## 2. 2-5-1 Master の上の行(M1)

- `.master251-title` の `max-width:210px` と `overflow:hidden` を外した。題は部品の幅(「Chord Dojo」の戻る + 「2-5-1 Master」= 261px)をそのまま取る。
- 場所が足りないときは**段階の説明が先に縮む**(`…`・`title` に全文)。1440 では 23px まで縮み、1280・1024 では 0px(その行に余地が無い)、768(2 段の形)では全文 75px。
- 上の行の高さ 42px と真ん中の差 ≤1px(p12-1-dojo-ui)は変えていない。

## 3. Chord Dojo のホーム(D1〜D5)

| # | やったこと |
|---|---|
| D1 | 上から「続きから」→ MIDI の注意 → 2 列、の順にした(注意は前は「続きから」の上) |
| D2 | 「ほかの最近」の 2 つは下線つきの文字のボタンで 1 行(220px まで・はみ出す字は `…`・`title` に全文・折り返さない・押せる高さ 44px) |
| D3 | 大きい札 4 枚を同じ形に:左に絵(130px)・右に中身(左寄せ)。題の行の右端に「›」。**2-5-1 Master の札も同じ形**(前は絵が上・中身が真ん中寄せ)。Form A〜D の 2×2 は中身の列の中、棒の下 |
| D4 | 札の高さは中身の高さ。同じ行の 2 枚は同じ高さ(グリッドの伸び)。中身の下の空き ≤24px |
| D5 | 絵は札の上の端にそろえ、中身に合わせて伸ばさない(130×96 のまま) |

## 4. Voicing Loop の進行選び(V1・V2)

- V1:見本データの `chordDegrees`・`chordRoles` を**アプリと同じ関数**で作るようにした。`library.ts` に `pickerHarmonyOfLabels(key, labels)` を足し、完全名から `parseChordLabel` → `pickerHarmony`(度数は `degreeOf`、役割は `progressionFunctions`)を通す。キーのある 3 つ(F♯・G・E)には付き、キーの無い 2 つには付かない。値を手で書いていない。
- V2:見本と見比べて、右の「選んだ進行」のコードの箱の上の線を 3px → **2px** にした(一覧の札の下の線は 2px で同じ)。度数は一覧の札の上・箱の上に出て、「度数を表示」を切ると度数だけ消えて色は残る(既存の作りどおり)。

## 見本と違う所(写真と見本を並べて見た結果)

- **役割のボタンの字**:見本は選ばれた役割を色の面 + 白い字で塗るが、指示書 P4 が「塗りつぶさない・その色の字・4.5:1」なので、そちらに従った。
- **ホームの絵の大きさ**:見本は 130×150 ほど、こちらは P23-27 H5 で決めた 130×96 のまま(D5 の「伸ばさない」は満たす)。絵は 130×96 で描いてあるため、高さだけ変えると上下に余白ができる。並び・位置は見本と同じ。
- **2-5-1 Master の Form のボタン**:見本の札には「新規学習・復習・Mixed Test」の文字リンクだけだが、P23-27 H6 の Form A〜D(2×2)を残した(D3)。絵が左に来て中身の幅が狭くなったので、ボタンの字は 2 行に折り返す(文字は変えていない)。
- **段階の説明**:1280・1024 では、その行に余地が無いため 0px に縮む(見本は 1440 の形だけ)。題は 4 つの大きさで切れない。
- **進行選びの札の数**:一覧は 5 枚 + 「…」(L5)、右の箱は 8 枚まで(L7)。見本は一覧 5 枚・箱 8 枚で同じ。
- **幅 600px 未満**:札は 2 列ではなく 1 列(見本は広い画面だけ)。480px で 2 列のままだと、130px の絵の右の名の列が 0 幅になったため。

## 今あるテストで直した所(A = たどり方、B = 決まりが変わった期待)

| ファイル:行 | 前 | 後 | A/B |
|---|---|---|---|
| `e2e/p23-12-pre-analysis.spec.ts:74` | 今の段に「（今ここ）」が見える | 見えない(`aria-current="step"` はそのまま) | B(P1) |
| `src/components/pre-analysis/PreAnalysisPlayback.test.tsx`(6・6b・6c・5b) | 鳴っている音は `C2 C3 …`(空白区切り)・開始時は空・停止で空・無いとき「なし」・再生中は凡例が隠れる | `C2 ・ C3 …`・開始時からその場所の音・停止でもその場所の音・無いとき「—」・凡例は出たまま | B(P6) |
| `e2e/p15-import-check.spec.ts:228` | 停止で鳴っている音の行が空になる | 停止した場所の音が残る | B(P6) |
| `e2e/p15-import-check.spec.ts:233` | 再生中は凡例の場所に名前が出て、停止で凡例に戻る | 名前は下の行に出て、凡例(数の札)は再生中もそのまま。6 音は `・` 区切りで省略されない | B(P6) |
| `e2e/visual.spec.ts-snapshots/capture-source-selection-…png`・`practice-…png` | — | 撮り直した(指示書で更新してよい 2 枚) | 基準の写真 |
| `e2e/p23-27-dojo-home.spec.ts`(C8)・`p23-24-master-top.spec.ts`(C7)・`p23-29-vl-picker.spec.ts`(C9)・`p23-12-pre-analysis.spec.ts`(C1〜C6) | —(新しいテスト) | 下の表 | 追加 |

- `.skip`・`.only`・retry・待ち時間の延長で通した物は無い。位置・大きさを数字で見ているテスト(p12-dojo-home-layout・p20-dojo-home・p22-01-home・p12-1-dojo-ui・responsive)の決まりは変えていない。p12-dojo-home-layout の「切れている字が無い」が落ちたときは、**作りを直した**(Form のボタンを折り返す)。

## 確かめたこと(番号ごと)

| # | テスト |
|---|---|
| C1 | e2e「P23-31 C1/C2/C3/C6」:3 つの丸(`✓`・`2`・`3`)・今の段に `aria-current="step"`・「（今ここ）」が無い・丸は 18px 以上で `border-radius: 50%` |
| C2 | 同上:混ざったパートの行の高さ ≤36px・`#pre-analysis-mix-note` が DOM にあり radiogroup の `aria-describedby` とつながる・「?」に焦点を当てると見える |
| C3 | 同上:選ばれている役割の背景の不透明度 ≤0.25・枠が役割の色で 1px・字が役割の名前・axe の serious/critical 0 |
| C4 | e2e「P23-31 C4」:選ばれている行を押して開いた後、マウスを行から外すとロールの絵が乗せる前と同じ(画素の数で比較)・乗せている間だけ薄い |
| C5 | 単体「5d. P23-31 P6: the line leaves out a hidden part, and names at most six notes, lowest first」と e2e「P23-31 C5」:1 小節目の頭で「鳴っている音 C2 ・ E3 ・ C4 ・ E4 ・ G4 ・ G5」(見本データと一致)・再生の行のすぐ下(0〜8px)・曲全体の帯の上 |
| C6 | C1/C2/C3/C6 のテスト:「詳しい設定」の右の端と「解析する」の左の端が 16px 以下(実測 10px) |
| C7 | e2e「P23-31 C7」:1440・1280・1024・768 で題の `scrollWidth <= clientWidth`(実測 261/261・471/471)。説明が縮んだときは `title` がある |
| C8 | e2e「P23-31 C8」:4 サイズで、注意が「続きから」の下・2 列が注意の下・最近 2 つが 1 行で高さ 44px 以上・幅 220px 以下・下線・`title`・4 枚とも絵が札の左端から 16px 以内で上端にそろう・中身が絵の右・中身の下の空き ≤24px・題の行に「›」・同じ行の 2 枚が同じ高さ |
| C9 | e2e「P23-31 C9」(見本データ):キーのある 3 行の札に `data-fn`(T/SD/SDm/D)と度数があり、キーの無い 2 行は `data-fn` 0・度数 0。右の箱の上の線が 2px で `--lv-fn-*` の値。単体「P23-31 C9: the picker's degrees and role colours follow the key and the 「度数を表示」 setting」:切ると度数の要素 0 で `data-fn` は残る。e2e「P23-31 C9: a saved progression's degrees and role colours agree with the Vault's chips」:同じ進行を Vault と並べ、`data-fn` と度数が一致(`T/Ⅰmaj7・T/Ⅵm7・SD/Ⅱm7・D/Ⅴ7`) |

## 大きさごとの数字

取り込み前の確認のピアノロールの高さ(直す前 = 後 + 音の行の高さ。1440・1280・1024 は行が 24.6px、768 は行を出さないので同じ):

| 大きさ | 直した後 | 直す前(概算) |
|---|---|---|
| 1440×900 | 508px | 約 533px |
| 1280×720 | 314px | 約 339px |
| 1024×768 | 344px | 約 369px |
| 768×640 | 184px | 184px |

- 縦にも横にもページは動かない(4 サイズ)。ロールは 4 つとも 180px より高い。
- 2-5-1 の題:4 サイズで `scrollWidth = clientWidth`(1440・1280・1024 は 261、768 は 471)。段階の説明は 23 / 0 / 0 / 75px。
- 進行選び:一覧の札の下の線 2px、右の箱の上の線 2px。キーのある行の度数と役割は Vault と一致。

## 最後の確かめ

```
npm run lint                      PASS(ESLint・Tailwind・source contracts)
npm run build                     PASS(8.5s)
npm run test:fast -- src/components/pre-analysis src/views/CaptureView.preAnalysis.test.tsx src/views/chord-dojo src/domain/master251 src/views/voicing-loop src/views/ProgressionVoicingPracticeView.test.tsx src/domain/progressionVoicingPractice
                                  PASS — Vitest 6800/6802(skip 2)
npm run test:ui -- 指示書の 19 spec PASS — Playwright 176/176
```

FULL の前の点検:`npx eslint .`・`npx tsc -p tsconfig.e2e.json`・`npx tsc`・`node scripts/lint-tailwind-classes.mjs`・`node scripts/lint-source-contracts.mjs`・`git diff --check master...HEAD`・`git diff --check HEAD` すべて PASS。

## FULL(最後に 1 回)

**1 回目**(`4ba3d899` の木):**FAIL — Playwright 軽い方**。Vitest full 6800/6802 と点検の段は PASS。

- `p12-3-dojo.spec.ts:456`(「F#m7」を待って「F♯m7」)と `p5-26-2-overview.spec.ts:85`(`1524 > 1524`)は、この指示書が変えていない画面。3 spec をまとめて単独で回すと、この 2 つは PASS した(負荷のときだけの揺れ)。
- `p12-vertical-layout.spec.ts:273` は**この指示書の作りが原因**だった。480px では札が 2 列のままで、130px の絵を左に置くと 2-5-1 の名の列が **0 幅**になり(実測)、ボタンが押せずに時間切れになっていた。`@media (max-width: 600px)` で 4 枚を 1 列にし、名の幅 190px で押せるようにした(`a8609bf8`)。home の 5 spec(vertical-layout・dojo-home-layout・p20・p22-01・p23-27)を回して **60/60 PASS**。
- 指示書の「この指示書で変えた画面のテストが落ちた → 直して、そのテストだけ通し、FULL をもう 1 回だけ」に従い、**1 回だけ**回し直した。

**2 回目**(`a8609bf8` の木):**PASS — 988.7s**

- Vitest full **6800/6802**(skip 2)/ Playwright 軽い方 **1128/1130**(skip 2、FAIL 0)/ heavy **53/53**・goto の開き直し 0 回・Git diff check PASS・Tracked PNG check PASS。

## 気づき

- 混ざったパートの行は「28px の切り替え + 枠 2px + 上下 6px」で 36px。1px でも超えると C2 が落ちるので、枠の分を勘定に入れる。
- `.dojo button {min-height:32px}` と同じ強さの規則では、CSS の読み込み順で負ける(高さ 44px が効かなかった)。`.dojo-home-p20 .dojo-home-p20-others button` まで強くした。
- `color-mix()` の `getComputedStyle` は `color(srgb r g b / a)` で返ることがあり、`rgba()` だけを見る parsed では不透明度を読めない。両方を受けるようにした。
- 鳴っている音の行を再生の行の外へ出したので、再生中に凡例が場所を譲る作りは無くなった(凡例は常に出る)。P15-04 の 2 本は形 B で直した。
- 2-5-1 の題は `max-width` を外すだけで直ったが、狭い幅では段階の説明が 0px まで縮む。題を優先する決まり(M1)どおり。
- 絵を左に置く形(D3)は、狭い幅(480px)では 2 列の札に収まらない。幅 600px 未満は 1 列にした。FULL の 3 件のうち 1 件はこれで見つかった(残り 2 件は負荷のときだけの揺れ)。

## P23-31b(見た目の直し・全部の大きさ)

- コミット:`6d82cd86` §1 ホーム → `cf369f36` §2 取り込み前 → `73e0558f` §3 2-5-1 の上の行 → `fd377556` §4 ほかの画面 → `0e4cc838` C1〜C13 と写真 → `26b75b11` 上の帯の切り替えのクラス → `9f26abb5` 基準の写真 2 枚 → `ea5eedfa` 報告の末尾 → `d2e4bb82` phase5.18 を O2(clip)に合わせた(B)
- 写真:`p89-generated/p23-31b/`(23 枚。git で追跡しない)

### 番号ごと

- **§1(P23-31b-01)**:絵を指示書の中身に丸ごと置き換えた(130×150)。H1〜H8(札の札を消して数はリンクの中へ、2-5-1 の Form を札の外の 2 行目へ、耳の ring に点、ステージの組を字から外す、続きからを 1 行、テーマを札に、型の凡例、登録した音の空の段)。CSS の塊を足し、古い決まりを消した。**段のリンクだけ**は、表の 2 列 + `nowrap` のままだと 2 列の幅で字が切れ、`p12-dojo-home-layout` の「切れている字 0」に反したので、折り返す(`white-space:normal`)。値は変えていない。
- **§2(P23-31b-02)**:A1〜A4(左の列 330px 以上・前の段の線を `display:none`・狭い時の混ざった行と名前の行)。
- **§3(P23-31b-03)**:T1〜T7(「Form/範囲/音域」の字を包む・48セルの長短・1179/1079/999 の段階・2 段の決まりを container に移す)。1440 は 42px と中心の差 ≤1px のまま。**境目(1180/1080/1000/900)は足していない** — C7 が 6 ケースとも重なり 0 で通ったため。
- **§4(P23-31b-04/04b)**:O1〜O8。O1 は focus-visible の class を消し、`#main-content { outline: none }` を足した(見える枠 0)。O2 は `overflow: clip`(ほかに `min-height:0` を足す必要は無かった)。O3 は動きの字を長短 2 つに。O4〜O7(耳)。O8 は tabs の `nowrap` と、入らない時の container query(上の帯の切り替え)。
- **テスト**:新しい C1〜C13 を p23-27・p23-12・p23-24・p23-20・p23-21・p23-23b に足した(下の表)。

### 見本と違う所

- ホームの段のリンク(ボイシングドリルの 4 つ)は 2 列のまま**折り返す**(見本は 1 行)。2 列の幅で長い名前を切らないため。
- そのほかは写真と見本を並べて、値・文字・並びの違いは見つけていない(1440・1366・1280・1024・768)。

### 今あるテストで直した所(A/B)

| ファイル:行 | 前 | 後 | A/B |
|---|---|---|---|
| `p12-1-dojo-ui.spec.ts:82` | 段階の説明の位置を常に比べる | 見えている時だけ比べる(T3 で 1179 以下は隠す) | B |
| `p22-01-home.spec.ts:255` | 8 つの題は同じ太さ | 大 4 枚 700・小 4 枚 400(表の 17px/700) | B |
| `p23-27-dojo-home.spec.ts`(C8) | 絵は 140px 以下 | 絵は 150px 以上(表の 130×150)・本文は札の上端から | B |
| `p23-20-voicing-loop-practice.spec.ts:85` | 画面の overflow は hidden | clip(O2) | B |
| `phase5.18-chord-context.spec.ts:34` | hidden/hidden/hidden | clip/clip/clip(O2) | B |
| `p23-27`(C1〜C5・C8)・`p23-12`(C6)・`p23-24`(C7)・`p23-20`(C9・C10・C13)・`p23-21`(C11)・`p23-23b`(C12) | —(新しいテスト) | 下のとおり | 追加 |
| `p23-27` C4(axe) | 開いてすぐ axe | フェードインの終わり(opacity 1)を待ってから axe | A |

### 確かめたこと(番号ごと)

C1〜C5 は p23-27 の「P23-31b C1-C5」(4 サイズ)、C8 は p23-27 の「P23-31b C8」、C6 は p23-12 の「P23-31b C6」、C7 は p23-24 の「P23-31b C7」(6 ケース)、C9・C10・C13 は p23-20、C11 は p23-21、C12 は p23-23b。すべて PASS。

### 最後の確かめ

- `npm run lint` PASS / `npm run build` PASS / `test:fast`(6 つの範囲)PASS **6800/6802**(skip 2)。
- `test:ui`(21 spec):最初の実行で visual の 2 枚(`capture-source-selection`・`practice`)だけ差 → 指示書のとおり 2 枚を撮り直し、visual **6/6 PASS**。ほかの spec は PASS。
- FULL の前の点検(eslint .・tsc・tsc e2e・class lint・source contracts・`git diff --check` ×2)PASS。

### FULL(1 回 + 回し直し 1 回)

- **1 回目(`ea5eedfa`)FAIL** — Playwright 軽い方 **1135 passed / 1 failed / 2 skipped**、heavy は回らず。落ちたのは `phase5.18-chord-context.spec.ts` の「画面の overflow は hidden」(O2 で clip にしたため)→ B で直し(`d2e4bb82`)、その spec 単独 4/4 PASS。
- **2 回目(`d2e4bb82` の木)FAIL** — Playwright 軽い方 **1132 passed / 4 failed / 2 skipped**、heavy は回らず。
  - `p12-3-dojo.spec.ts:456`:「F#m7」を待って「F♯m7」。**この枝で単独 3 回とも落ち**、master(`ebb2675d`)で単独 1 回は **PASS(40/40)**。指示書の表と関係ない画面で、原因は未確定(表示の綴りと期待の生の綴りの違い)。
  - `p23-23a-ear-stage.spec.ts:82 / 292`:単独では **PASS**(master でも PASS)。並列のときだけ落ちた。
  - `p5-26-2-overview.spec.ts:85`(`1524 > 1524`):単独で **PASS**。
- QUEUE の決まり 2「FULL の回し直しは 1 回の FULL につき最大 1 回。2 回目も落ちたら、理由が何でも止まる」により、**3 回目は回さず止まった**。master には入れない。P23-32 は始めていない(`done\P23-31b.md` が「止まった」のため)。
