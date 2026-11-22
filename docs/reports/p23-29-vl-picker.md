# P23-29 Voicing Loop の進行選びの報告

- ブランチ:`feat/p23-29-vl-picker`(`feat/p23-20-voicing-loop-practice` `a08282b0` から)
- コミット:
  - `0ebc2b90` 実装(L1〜L9)
  - `ea58aa60` 今あるテストを形 A/B に直した(WIP)
  - `a0c7fb6d` C2
  - `f8ae1bf8` C3
  - `089412f8` C4・L8
  - `091aa884` 途中の報告
  - `7ceed692` C1(単体)と C2 の残り。L8 の空のとき・最初の選択を直した
  - `d82840e4` C5・L10 の e2e と写真。合成の候補に `block` を足し、行の ARIA と色を直した
  - `4c4874dc` 1024px 未満の積み方を直した(768×640 で一覧が 2px に潰れていた)
  - `71a3ead5` 「お気に入り」の切り替えに見本の ♥ を付けた
- master には入れていない・push していない。

## やったこと(番号ごと)

| # | やったこと |
|---|---|
| L1 | 「続きから」の帯(`voicing-loop-resume`・`voicing-loop-resume-go`)。`lastPractice.ts` の記録の進行が**今も練習できるときだけ**出す。左に VL の印・「続きから」・題・「{キー} ・ {n} 小節 ・ {日}練習」、右に主の「続ける Enter」。押すとその進行で練習が始まる。区間・段は出さない |
| L2 | 道具の行(`voicing-loop-picker-tools`):切替「すべて n」「♥ お気に入り n」「最近使った n」(`role="radiogroup"`・`voicing-loop-filter-all\|favorites\|recent`)/ 検索(今の欄。id・名前・幅は今のまま)/ 右に「＋ テキストで新しい進行」(読み上げ名は今の文のまま)。**見本の「並び」の選びは作っていない** |
| L3 | 「すべて」は今の節(お気に入り・最近使った・そのほか)、「お気に入り」「最近使った」はその節だけ、検索中は今の「検索結果」 |
| L4 | 2 列(`.lv-vl-picker-grid` = `minmax(0,1fr) 400px`)。**1024px 未満は 1 列**にして右を一覧の下へ(窓にはしない)。下では 2 枚がそれぞれの高さを保ち、列が縦に動く(768×640 で一覧が潰れたのを直した) |
| L5 | 行(`voicing-loop-progression-row`):左から ♥(32px・`voicing-loop-favorite`)/ 題と 1 行の事実「{キー} ・ {BPM} ・ {n} 小節」(仮のテンポは薄い字と `title`)/ **役割の色つきの札**(5 枚まで・残りは「…」)/ 右に最後に練習した日(`voicing-loop-progression-day`。記録は 1 件なので他は「—」)。練習できない行は薄く、コードの代わりに理由(`voicing-loop-progression-reason`、`title` に全文) |
| L6 | 1 回押すと**選ぶだけ**。選ばれている行をもう一度押す・Enter・右の「この進行で練習する」で始まる。♥ では始まらない。**行ごとの「練習する」(`voicing-loop-progression-practice`)は無くした** |
| L6b | 「選ばれている行」= 押して選んだ行と、最初から選んである行。検索・切替で選択が一覧から消えたら、見えている一番上の練習できる行を選び直す(無ければ選択なし・右は「進行を選んでください」) |
| L7 | 右の「選んだ進行」(`voicing-loop-preview`):題(20px)/ 札(キー・BPM・小節・n コード)/ 4 列のコードの箱(上に度数・役割の色、下にコード名。押すと鳴る)/ 小さいピアノロール(`LoopRoll`)/「▶ 試聴 Space」/ 事実 3 行(最後に練習・使える音・保存した日)/ 主の「この進行で練習する」(`voicing-loop-preview-practice`)と「Vault で開く」(`voicing-loop-preview-open`) |
| L8 | 開いた時の選択は、続きからの進行 → 無ければ**一覧の一番上の練習できる行**(お気に入り→最近使った→そのほかの並びの先頭。候補の配列順ではない)。0 件のときは今の「まだ進行がありません」の表示のまま、**右の列は出さない** |
| L9 | 検索の欄に入力している間は Space・Enter・矢印を拾わない(ボタンに focus があるときも、そのボタン自身に任せる)。Esc は今のまま(ピッカーは拾わない) |
| L10 | 1440×900・1280×720 で、右の「この進行で練習する」が窓の中(下に 21px の余り)。ページも workspace も動かず、一覧の列だけが縦に動く |
| 部品 | 画面は `src/views/voicing-loop/VoicingLoopPicker.tsx`。`ProgressionVoicingPracticeView` の `if (!progressionLoaded)` はこれを返すだけ。ことばは今までどおり `copy.ja`(`text` で渡す) |
| ドメイン | `VoicingLoopVaultCandidate` に `block`・`chordCount`・`savedVoiceCount`・`hasSourceMidi`・`chordRoles`・`chordDegrees`。役割は `chordFunction.ts` に足した `functionKeyOf` + `progressionFunctions`、度数は `degreeOf` |
| 共通部品 | `src/views/vault/progressionPreviewRequest.ts`(`previewRequestOf`)を Vault の右と ピッカーの ▶ で共用(Vault の見た目・働きは変えない) |
| テストの道具 | `e2e/helpers/voicingLoopPicker.ts`(`startPracticeFromRow`・`startPracticeNamed`・`selectedRow`)。合成の候補(`progressionVoicingPracticeE2eFixture.ts`)に `block` を足し、右の列のロールと ▶ が本物と同じように出るようにした |

## 見本と違う所

- 見上の題(「練習する進行」)は**見える題を置かず**、`sr-only` の `h2` で残した(見本の道具の行に題が無いため)。VL-06 のテストは題の代わりに道具の行を測る。
- 「最後に練習」の日は、記録が 1 件(`lastPractice`)しか無いのでその 1 行だけ。他は「—」。
- 行の入れ物は `role="list"` + `role="listitem"`(見本に ARIA は無い)。`role="option"` にすると ♥ のボタンが `nested-interactive`、親が `listbox` でないと `aria-required-parent` になり、C5 の axe(serious/critical 0)を満たせない。選ばれている行は `aria-current="true"` で表す。
- 選ばれている行の日は `--lv-text-secondary`、`Space` の `kbd` は不透明(`opacity` を外した)。アクセント色の上の `--lv-text-muted` と 70% の `kbd` は 4.5:1 に届かなかった。
- 1024px 未満のとき、右の列は一覧の下でそれぞれの高さを保ち、**列が縦に動く**(見本は 1 画面に収まる想定)。狭い窓で一覧が潰れるのを避けるため。

## 今あるテストで直した所(A = たどり方、B = 決まりが変わった期待)

| ファイル:行 | 前 | 後 | A/B |
|---|---|---|---|
| `src/views/ProgressionVoicingPracticeView.test.tsx`(ピッカーの 8 か所) | `h2` の「練習する進行」/ 行の「練習する」ボタン | 一覧の `aria-label`・行を押す・右の主のボタン | A・B(L6/L7) |
| 同(3 か所) | 行に「練習する」が 1 つずつ | 行には無く、右に 1 つ | B(L6) |
| 同(追加) | —(新しいテスト) | C1 の 2 本(L1〜L5・L7〜L9)と C2 の残り 1 本。harness に `onOpenInVault` と `savedBlock` を足した | 追加 |
| `e2e/p22-02-vl-picker.spec.ts` | 行の練習ボタンの focus/click・「hovered row fills」・`lv-vl-picker-tags` | 右の `voicing-loop-preview-practice`・選択の印・1 行の事実 | A・B |
| `e2e/vl-15-progression-picker.spec.ts` | 行の右の練習ボタンの位置・4 本のボタン・行 64px | 日の列の位置・行 72px 以下・札の nowrap/overflow | B |
| `e2e/voicing-loop-v2.spec.ts` | 題(level 2)の位置・行の練習ボタン 2 つ | 道具の行の位置・行にボタン 0・右の主のボタン有効 | B |
| `e2e/voicing-loop-v2.spec.ts:328`(VL-07) | 開いたとき「Public ready progression」が選ばれている | 一覧の一番上の練習できる行「Public missing BPM」が選ばれている(fixture は一番新しい行が練習できない。並びは capturedAt 順で、候補の配列順ではない) | B(L8) |
| `e2e/phase5.28-voicing-loop-navigation.spec.ts` | 行の練習ボタンで Enter/クリック | 右の主のボタンで Enter・`startPracticeNamed` | A |
| `e2e/phase5.31-control-timing.spec.ts` | 同上 | 右の主のボタンで Enter | A |

- `.skip`・`.only`・retry・待ち時間の延長で通した物は無い。
- 実装側で直した物(テストの期待は変えていない):行の ARIA(`list`/`listitem`)、選ばれた行の日と `kbd` の色、1024px 未満の積み方、`unavailableTitle` の未使用引数(前のコミットで入った物が、このセッションでファイルを触ったため ESLint に初めて当たった)、合成の候補の `block`。

## 確かめたこと(番号ごと)

| # | テスト |
|---|---|
| C1 | 単体「P23-29 C1: L1-L5 — 続きから, the tool row, the sections, the two columns and the row」(L1 の帯の文と「続ける Enter」/L2 の `radiogroup`・3 つの `radio`・件数・検索の id と placeholder・入口が行の右端/L5 の ♥ の位置・1 行の事実・役割色の札・日・理由・行に練習ボタン 0/L4 の 2 列の順/L3 の節と切替と検索)と「P23-29 C1: L7-L9 — the chosen column, the first pick and the search box」(L7 の題・札 4 つ・コード 4 列の箱と度数と役割色・`home-loop-roll`・▶ 試聴・事実 3 行・主のボタンと Vault で開く/L8 の最初の選択と 0 件で右を出さない/L9 の検索の欄の Space・Enter・矢印)。e2e「C1/L1: the 続きから band appears after a practice and its 続ける opens it」(本物の Vault で 1 回練習 → 帯 → 続ける → 練習が開く)、「C1/L4: below 1024px the chosen progression goes under the list」、「L10/C5」(下の数字)。L6・L6b は C2、L10 は C5 の e2e |
| C2 | 単体「P23-29 C2: the first press picks, the picked row starts, and the star never starts」+「P23-29 C2: Enter, the right column's button and a list where nothing can be practiced」。① 選ばれていない行=選ぶだけ ② 選ばれている行(押して選んだ行と、開いたとき最初から選んである行の両方)=押すと始まる ③ Enter(ボタンに focus が無いとき)と右のボタン=始まる ④ ♥=始まらない ⑤ 練習できない行=選べない(`aria-disabled`・押しても選択も開始もしない) ⑥ 検索・切替で選択が消える=見えている一番上の練習できる行/1 つも無ければ選択なしで Enter が何もしない。e2e `p22-02` の「a row opens its practice once by click/Enter/Space」(recent の書き込みが 1 回=二重に始まらない)と「the star never opens the practice」 |
| C3 | 単体「P23-29 C3: the right column counts the saved voicings and draws no degree without a key」(保存した音 3/8・元の MIDI の有無・キー無しで度数なし) |
| C4 | 単体「P23-29 C4: the 続きから band only appears while that progression can still be practiced」(進行が消えた/練習できなくなったで帯が消える) |
| C5 | e2e「P23-29 C5: no sideways overflow and no serious or critical axe finding at the four sizes」(1440×900・1280×720・1024×768・768×640。body の scrollWidth = clientWidth、axe の serious/critical は 4 つとも 0)、「C5: the arrows pick, Space auditions and Esc stays as it was」(↓↑ で選択が動く・Space は試聴で練習は始まらない・Esc は `defaultPrevented=false` で何も起きない)、「C5: Enter starts the picked progression」(本物の Vault) |

- 緑のテスト(このブランチの最終 HEAD):単体 **110/110**(`ProgressionVoicingPracticeView.test.tsx`)、広い単体 **6798/6800**(skip 2)、e2e の新しい spec **9/9**、最後の確かめの e2e **161/161**。

## 大きさごとの数字

横のはみ出し(body の scrollWidth / clientWidth)と axe(serious/critical の件数):

| 大きさ | scrollWidth / clientWidth | axe |
|---|---|---|
| 1440×900 | 1440 / 1440 | 0 |
| 1280×720 | 1280 / 1280 | 0 |
| 1024×768 | 1024 / 1024 | 0 |
| 768×640 | 768 / 768 | 0 |

L10(右の「この進行で練習する」が窓の中・一覧だけが動く):

| 大きさ | ボタンの上端〜下端(窓) | ページの縦スクロール | workspace の縦スクロール | 一覧の下端 | 右の列の幅 | 一覧の右端 → 右の列の左端 |
|---|---|---|---|---|---|---|
| 1440×900 | 839〜879(900) | 0 | 0 | 892 | 400 | 1008 → 1016 |
| 1280×720 | 659〜699(720) | 0 | 0 | 712 | 400 | 848 → 856 |

- 一覧の列の `overflow-y` は `auto`(一覧の中だけが縦に動く)。

L4(1024 は 2 列・768 は下に回す):

| 大きさ | 一覧 | 右の列 | 並び |
|---|---|---|---|
| 1024×768 | 左 88・右 592(幅 504)・上 230.6・下 760 | 左 600・右 1000(幅 400)・同じ高さ | 横に並ぶ |
| 768×640 | 左 80・右 752・上 336.6・下 480.3(高さ 143.7) | 左 80・右 752・上 488.3・下 632 | 下に回る(列が縦に動く) |

## 写真

`p89-generated/p23-29/`(git で追跡しない):

- 1440×900:`resume-1440x900`・`no-resume-1440x900`・`favorite-toggle-1440x900`・`search-1440x900`・`unavailable-1440x900`
- 1280×720:`resume-1280x720`・`no-resume-1280x720`・`favorite-toggle-1280x720`・`search-1280x720`・`unavailable-1280x720`
- 1024×768:`resume-1024x768`
- 768×640:`resume-768x640`

## 最後の確かめ

最終 HEAD `71a3ead5` で回した。

```
npm run lint                      PASS(ESLint・Tailwind・source contracts)
npm run build                     PASS(tsc + vite build、8.63s)
npm run test:fast -- src/views/ProgressionVoicingPracticeView src/domain/progressionVoicingPractice src/voicingPractice src/views/VaultView src/views/vault
                                  PASS — Vitest 6798/6800(skip 2)— 94.9s
npm run test:ui -- 名前に voicing・vl-・vault を含む spec 全部 + 当たりそうなファイル + visual・accessibility・keyboard・responsive
                                  PASS — Playwright 161/161 — 124.3s
```

- e2e の選択 `test:ui` に渡した spec:`p19-voicing-drill`・`p22-02-vl-picker`・`p23-10-vault-list`・`p23-20-voicing-loop-practice`・`p23-29-vl-picker`・`p5-26-2-voicing-navigator`・`p5-26-2-voicing-slots`・`phase5.27-voicing-loop-ui`・`phase5.28-voicing-loop-navigation`・`phase5.30-voicing-loop-polish`・`phase5.33-voicing-rule-ui`・`vault-flow`・`vl-13-screens`・`vl-13-voicing-loop`・`vl-14-resume-smooth`・`vl-15-progression-picker`・`voicing-loop-v2`・`voicing-loop-vl09`・`voicing-loop-vl10`・`voicing-loop-vl11`・`voicing-loop-vl12`・`p23-07-command-palette`・`phase5.31-control-timing`・`visual`・`accessibility`・`keyboard`・`responsive`。
- 取りこぼしの確認:`voicing-loop-progression-practice`(無くした testid)は `p22-02`・`vl-15`・`voicing-loop-v2`・単体に「0 個」としてだけ残る。`role="option"` をピッカーの行に使うテストは無い(`p23-07` の command palette は別物)。`lv-vl-picker-tags` を見るテストも無い。

## FULL(1 回)

`npm run test:full`(HEAD `5abd8ac9`。10〜12 番の後の 1 回)。

- Vitest full:**PASS 6798/6800**(skip 2)
- Playwright 軽い方:**PASS 1120/1122**(skip 2、FAIL 0)— 647.9s
- Playwright heavy:**PASS 53/53** — 294s
- goto の開き直し 1 回・Git diff check PASS・Tracked PNG check PASS
- **FULL: PASS — 1021.3s**
- 11 番(P23-20)の FULL で落ちた 3 件(`jazz-progressions.spec.ts:497`・`p12-4-long.spec.ts:173`・`p23-23a-ear-stage.spec.ts:116`)は、この FULL では落ちなかった(軽い方は FAIL 0)。

## 気づいたこと

- **画面のフェードイン中に axe を回すと、実際には 4.5:1 以上ある文字が足りないと出る。** `#main-content` が `opacity` の遷移中(実測 0.13〜0.78)だと、axe は合成後の色で判定する。`#main-content` の `opacity` が 1 で、動いている animation が 0 になってから axe と写真を取る小さな待ち(`waitForScreenSettled`)を置いた。時間で待たない。
- 行の `role="option"` は、♥ のボタンで `nested-interactive`、親が `listbox` でないと `aria-required-parent`、`listbox` の直下が `div` だと `aria-required-children` になる。`list`/`listitem` にして、選択は `aria-current` で表した。見た目と `data-*` の属性(テストのたどり方)は変えていない。
- 選ばれている行の上では `--lv-text-muted` が 4.14:1、`kbd` の `opacity: 0.7` が 4.44:1 だった。どちらも 4.5:1 に届かないので、土台の別の色(`--lv-text-secondary`)と不透明にした。
- 1024px 未満の `grid-template-rows: minmax(0,1fr) auto` は、768×640 で一覧を 2px まで潰した。`auto auto` + 列の縦スクロールに変え、一覧の高さが 120px 以上あることをテストで確かめている。
- L8 の「一覧の一番上」は候補の配列順ではなく並び(お気に入り→最近使った→その他)の先頭。`buildVoicingLoopVaultCandidates` は並べ替えて返すので本物では同じだが、合成の候補は配列順と並びが違うため、VL-07 の期待を B で直した。
- 合成の候補に `block` を足したので、ピッカーの右の列にピアノロールと ▶ 試聴が出る(前は出ず、L7・L10 を本物に近い形で測れなかった)。保存した音は 0/n のまま(合成の候補は `voicingMemory` を持たない)。
- `unavailableTitle` の未使用 `text` 引数は前のコミットで入っていた。ファイルを触ったので ESLint に初めて当たり、落とした。
