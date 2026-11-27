# P23-20 Voicing Loop の練習画面の報告

- ブランチ:`feat/p23-20-voicing-loop-practice`(11 番。`feat/p23-12-pre-analysis` の先頭 `b5764c87` から)
- コミット:`b6e332d7` L1(前のセッション)→ `37fb8383` L2 → `42f4effb` L3 → `85d0592b` L1 のテストの取りこぼし → `c46a82ea` L4・L2 の札の名前 → `568d2a9d` L5 → `52e0ff29` L6・L7 → `7ec64f9b` C1〜C6 と写真 → `b4fa36c9` e2e の型の直し → この報告
- 質問:なし(止まらずに進めた)。`QUESTION.md` は書いていない

## やったこと

| # | やったこと |
|---|---|
| L1 | (前のセッション)`src/components/voicing/HandSlotPanel.tsx` を、1 手 = 5 つの固定の札(左手 L5〜L1 / 右手 R1〜R5)に作り直した。使わない指は薄い空の枠で「·」を出さない。このセッションでは、そのときに直しきれていなかったテスト 3 ファイルを直した(下の表) |
| L2 | 上の帯を 2 つの `fieldset`、「**音の出どころ**」(ソース・生成タイプ・詳しい設定)と「**表示**」(覚える/思い出す・進行に合わせて最適化・おすすめ運指を表示)にした。名前の無かった 2 つのチェックは、いつでも見える札の名前を付けた(「最適化」「運指」)。読み上げ名と `title` は今の文のまま(`aria-label` = 「進行に合わせて最適化」「おすすめ運指を表示」)。1440 で 36px(1 行)・1280 で 36px(1 行)・1024/768 で 2 行(76px) |
| L3 | 今のコード名の横に**度数(Ⅱm7 の形)**と**役割の色**。度数は `src/domain/harmony/degrees.ts` の `degreeOf`、役割は `src/domain/harmony/chordFunction.ts` の `progressionFunctions`(新しく作っていない)。役割は札(T / SD / SDm / D)+ 度数の文字の色(`--lv-fn-*`)。**キーの無い進行では出さない**。設定「度数を表示」(`settings.showRomanNumerals`)を切ると**度数だけ**消えて役割の札と色は残る(`App.tsx` から `showDegrees` で渡す) |
| L4 | 「次への動き」を**左手・右手の 2 つの箱**にした。箱は角丸 8px・線 1px・幅 341px(1440)・高さ 68px で、中身(5 つの指の札・言葉・確かさ)は今のまま。箱の見出しは「次への動き · 左手」の形(見本の見出しと同じ) |
| L5 | くり返している区間の**札に色**を付けた:帯の上に `voicing-loop-range-band`(高さ 4px・区間の拍の幅)を出し、区間の札の面も `--lv-accent-soft` で塗る。解除は帯の右の「区間 2〜4 ×」(`voicing-loop-range-chip`。`aria-label`「区間ループ 2〜4 を解除」)で、押すと色もくり返しも消える。くり返しの決まりは今のまま |
| L6 | 768×640 で左メニューを開いたときの**横のはみ出し**を直した(下の「測った数字」)。原因は 2 つとも「固定の 1 行に詰め込んで、あふれた分を中で隠していた」こと:① 再生の帯の 1 段目が横にスクロールしていた(768+メニューで中身 654px / 枠 486px、1440 でも 1211px / 1134px)② 進行の帯の見出しが切れていた(502px の枠に 523px)。①は**折り返す**(帯は中身に合わせて高くなる。広い窓では今までどおり 92px)、②は**見出しを折り返し、帯の高さを中身に合わせる**。1440 では言葉を隠す境目を 1000px → 1200px に広げて、1 行に収めた(押せない所・切れる所が 0 になった) |
| L7 | この画面のコード名の半角を `displayChordLabel`・`ChordName` にそろえた:進行選びのコードの並び(「B♭9 → …」)、現在/次/その次の `title` と読み上げ、進行の帯の札の `title` と `aria-label`、未解決の一覧、**キーの選択肢**(「D♭メジャー」) |

### L6 で測った数字(直す前 → 直した後)

| 窓 | 直す前 | 直した後 |
|---|---|---|
| 768×640・左メニュー開 | 再生の帯の中身 654px / 枠 486px(**168px はみ出し**。横スクロールで隠れていた)・進行の帯の見出し 523px / 502px(21px 切れ) | 再生の帯 486 / 486(2 段目に折り返し)・進行の帯の見出し 486 / 486(2 行)・**窓からはみ出す押せる物 0** |
| 1440×900 | 再生の帯の中身 1211px / 枠 1134px(77px 隠れ。「区間解除」が切れて見えた) | 言葉を隠して 1 行(「区間解除」まで見える)。帯は 92px のまま |
| 1280×720 | 再生の帯は横スクロール | 1 行・92px のまま |

- 縦の長さ(練習画面の中のスクロールする所の中身 / 見えている高さ):1440 953/792・1280 927/612・1024 969/660・768 1345/474。**1440 と 1280 はこの段の前(b6e332d7)と同じ**(953・927)。1024 は +2、768 は +37(どちらも折り返した 2 段目の分)。**窓そのものは縦にも横にもスクロールしない**(`html` は `overflow: hidden`。この段の前から同じ)。
- 1440×900 で「1 画面に収まる」か:この段の前から**収まっていない**(中身 953px / 見えている 792px)。1920×1080 では収まる(既存の `phase11-acceptance-geometry` が確かめている)。指示書の「今と同じ」を、**この段で増やさない**と読んで、1440/1280 の数字を変えないことを確かめた。

### 直したテストの一覧(A = たどり方、B = 決まりが変わった期待)

| ファイル:行 | 前 | 後 | A/B |
|---|---|---|---|
| `src/views/ProgressionVoicingPracticeView.test.tsx:660`・`:896` | legend `["ソース","生成タイプ","表示"]` | `["音の出どころ","表示"]` | B(L2) |
| 同 `:672`〜`:683`・`:699`〜`:705`・`:1391` | 親の `textContent` に「進行に合わせて最適化」「おすすめ運指を表示」を含む物を探す | `controlCheckbox(container, label)`(読み上げ名か札の字で探す) | A(L2。探し方だけ) |
| 同 `:535`・`:536`・`:600`・`:601` | 度数 `Ⅰ`・`Ⅱ` | `Ⅰmaj7`・`Ⅱm7`(度数にコードの種類を付ける形) | B(L3) |
| 同 `:29`(`FingeringRankerAcceptance.test.tsx`) | `tr[data-row="finger"] td[data-used="true"]` | `[data-testid="voicing-loop-hand-slot"][data-used="true"] .voicing-hand-slot-finger` | A(L1 の取りこぼし) |
| `scripts/p11-12/uiAudit.test.tsx:30` | 同上(表) | 同上(札) | A(L1 の取りこぼし) |
| `e2e/phase5.27-voicing-loop-ui.spec.ts:48`〜`:56` | `tr[data-row=…] td[data-used]` と「音名」「構成音」の文字 | 札の `data-used` と `.voicing-hand-slot-pitch` / `-degree` | A・B(L1) |
| `e2e/voicing-loop-vl11.spec.ts:72`〜`:85` | 「指」「音名」「構成音」の文字・`rgba(…, a)` だけで色を読む | 札 10 枚と中の 3 つの欄・`color(srgb … / α)` も読む | A・B(L1) |
| `e2e/voicing-loop-vl12.spec.ts:145`〜`:147`・`:119` | 同上・`overflow-y: hidden` | 札 5 枚・`overflow-y` が `auto`/`scroll` でない(折り返して高くなるため) | A・B(L1、L6) |
| `e2e/phase5.32-suggested-fingering.spec.ts:25`・`:26` | `Ⅰ`・`Ⅱ` | `Ⅰmaj7`・`Ⅱm7` | B(L3) |
| `e2e/phase5.33-voicing-rule-ui.spec.ts:75` | legend 3 つ | legend 2 つ | B(L2) |

- 足したテストの確認:`src/views/ProgressionVoicingPracticeView.test.tsx` に C3(キーあり/キーなし/「度数を表示」切)を 1 本、A/B のテストに L3 の役割の色と L5 の帯の確かめを数行。`jsdom` のテストは `renderView` に `showDegrees` を足した(テストの道具だけ)。
- `.skip`・`.only`・retry・待ち時間の延長で通した所は無い。

## 指示書どおりにできなかった所・読み方

1. **L3 の度数の付ける所**:「今のコード名の横」を、現在・次・その次のコード名と読んだ。進行の帯の札の度数は今までどおりローマ数字だけ(札が狭く、`compact` のときは出ない)。見本の `♭III7` + 札(D)は、度数 + 役割の札として作った。
2. **L4 の「言葉は今のまま」**:箱の見出しに「次への動き ·」を入れた(見本の見出しが「次への動き ・ 左手」のため)。「左手」「右手」「指を替える」「ループ先」「確定/推定」の言葉と決まりは変えていない。
3. **L5 の ×**:帯の中に別の × を置かず、**帯の見出しにある今の札**(「区間 2〜4 ×」)をそのまま解除に使った(指示書の注記どおり、transport の「区間解除」も残している)。写真 `range-1440x900.png` に色の付いた区間と札が写っている。
4. **L6 の「112px はみ出す」**:その数字そのものは今の木では再現しなかった(body のはみ出しは 0)。**中で隠れていたはみ出し**を測って直した(上の表)。**押せる物が窓からはみ出す数は 0**(4 サイズ + 768+メニュー)。代わりに 768 では再生の帯と進行の帯の見出しが 2 段目になる(縦 +37px)。
5. **L7 の残り**:この画面にまだ半角があるのは、**鍵盤の音名**(`F#5`。音名の見せ方の設定に従う)と**手の札の構成音**(`b7`・`b3`。度数の綴り)で、どちらもコード名ではないため触っていない。コード名とキー名は ♭/♯ にそろえた。
6. **見本との違い**:見本 `p23-ui-mock.html` の「表示」は「運指を出す」「次の形を出す」の 2 つだが、指示書の L2 は「進行に合わせて最適化」「おすすめ運指を表示」なので指示書を採った。

## 確かめること(番号ごと)

| # | 確かめた物 | どこで |
|---|---|---|
| C1 | L1〜L7 のそれぞれ。L1 は札 5 枚と使わない指の枠、L2 は legend 2 つと札の名前、L3 は度数と役割の色(色の値が `--lv-fn-t` と一致)、L4 は箱 2 つ(線 1px・札 5 枚・「次への動き」「左手/右手」)、L5 は帯の色、L6 は 4 サイズ + メニュー開、L7 はコード名 | e2e `p23-20-voicing-loop-practice.spec.ts` の 4 本(「C1 + C5」「C1 + C2」「C1: the top band」「L7: the picker」) |
| C2 | 3 音のコードと 5 音のコードで、札の**左端と幅が同じ**。使わない指の枠に音名・構成音・「·」が無い(指の名前は残る) | e2e「C1 + C2: the hand panels are five fixed slots whatever the chord uses」 |
| C3 | キーのある進行で度数と色が出る/キーの無い進行では出ない/「度数を表示」を切ると度数だけ消える | 単体「P23-20 C3: …」(3 通り)。設定から切って練習画面に戻る所は e2e「C3: 「度数を表示」 from the settings hides the degree text only」 |
| C4 | 区間をくり返している間、帯のその区間に色が付く(帯 4px・区間 428px・中の札 4 枚)。× で色が消え、くり返しも止まる(区間解除のボタンが押せない状態に戻る) | e2e「C4: the repeated stretch of the strip is coloured and × clears both」+ 単体(A/B のテストに追加) |
| C5 | 1440/1280/1024/768 で横にはみ出さない(窓・練習画面・押せる物)。1440/1280 の縦の長さはこの段の前と同じ。768+左メニュー開もはみ出さない | e2e「C1 + C5: the four sizes keep every part inside the window and the top band on one line」 |
| C6 | axe の serious・critical が 0。キー操作(Space で開始、← → で札を移る、Esc で停止)が今のまま | e2e「C1 + C6: axe has no serious or critical finding, and the keys still work」 |

## 最後の確かめ

| 確かめ | 結果 |
|---|---|
| `npm run lint` | PASS(eslint・Tailwind のクラス・source contracts) |
| `npm run build` | PASS(tsc + vite build。8.9 秒。500kB 超の塊の警告は前から) |
| `npm run test:fast -- src/views/ProgressionVoicingPracticeView.test.tsx src/voicingPractice` | PASS 6792/6794(選択が広がって全体。残り 2 は元から `.skip`) |
| `npm run test:ui -- 名前に voicing を含む spec・p23-06b-bass-global-bpm・visual・accessibility・keyboard・responsive` | PASS **130/130**(104.4 秒) |
| `npx tsc -p tsconfig.e2e.json` / `git diff --check master...HEAD` / `git diff --check HEAD` | PASS |
| 写真 | `p89-generated/p23-20/` に 10 枚(1440×900・1280×720・1024×768・768×640、768×640 のメニュー開、区間、度数を消した所、手の札、進行選び)。git で追跡しない |

## FULL

`npm run test:full` を `b4fa36c9` の木で 1 回(報告の文だけ未コミット)。**FAIL**。

| 段 | 結果 |
|---|---|
| Repository ESLint・Class lint・Source contracts・E2E TypeScript・Phase docs・AI handoff・Privacy scan・App TypeScript・Production build・Runner contracts(40)・Gallery excluded | すべて PASS |
| Vitest full | **PASS 6792/6794**(85.6 秒。残り 2 は元から `.skip`) |
| Playwright full(軽い方) | **FAIL 3 件 / 1108 PASS / 2 skip**(10.9 分) |
| Playwright heavy | 回っていない(軽い方が落ちたため、ランナーがそこで止まった) |

落ちた 3 件(この指示書で変えたファイルとは関係しない画面):

| spec | 出た文 |
|---|---|
| `e2e/jazz-progressions.spec.ts:497`(「the tempo of the listening …」) | `jazz-card` の 2 枚目が 8 秒以内に `data-listening="true"` にならなかった(期待 `true` / 実際 `""`) |
| `e2e/p12-4-long.spec.ts:173`(「"同じキーでもう一度" starts another pass; the back button goes to the list」) | 時間切れ(5 秒) |
| `e2e/p23-23a-ear-stage.spec.ts:116`(「C1: the top row …」) | `kinds` が `""`(期待は T/SD/SDm/D のどれか) |

QUEUE の決まり 3 に沿って調べた。

1. `git diff --name-only b5764c87..HEAD` に、この 3 つの画面(Chord Dojo の Jazz・P12.4 の通し・耳で弾くの舞台)のファイルは**無い**。
2. 過去の記録:
   - `jazz-progressions.spec.ts:665`(同じ「通して聴く」のテスト)は **P23-16 の FULL でも落ち、単独では通った**と `docs/reports/p23-16-correction-workspace.md:182` に記録がある。
   - `p12-4-long.spec.ts` は `docs/reports/test-slim-2026-11.md:60`(ホスト負荷 47% の FULL で 1 回)と `test-stability-2.md:26`(描画待ちを足した)に、負荷で揺れる記録がある。
   - `p23-23a-ear-stage.spec.ts` は `docs/reports/p23-23b-ear-result.md:51` に、同じ spec の描画待ち(`waitForTimeout` → `expect.poll`)を直した記録がある。
3. 単独で回した:3 spec まとめて **PASS 55/55**(179.5 秒)。FULL と同じ並びに近づけて、落ちたテストだけを `--repeat-each=3 --workers=6` で回した:jazz 3/3・p12-4-long 3/3・p23-23a 3/3、**全部 PASS**。
   - master との比較:`jazz-progressions`・`p12-4-long` は master にもファイルがあるが、落ちたテスト自体はこのブランチで足した物なので同じ条件で比べられない。`p23-23a-ear-stage` は master に無い。**master で同じくらい落ちるかは測れていない。**

**記録:原因未確定の間隔失敗 3 件**(「既知の揺れ」とは書かない)。直していない・FULL は回し直していない(QUEUE の決まり)。master に入れてよいかは、QUEUE の「別」の節のとおりリードの判断にする。


## 気づき

- L1 のときに直しきれていなかったテストが 3 ファイルあった(`FingeringRankerAcceptance.test.tsx`・`scripts/p11-12/uiAudit.test.tsx`・`phase5.27-voicing-loop-ui.spec.ts`)。どれも古い表の `tr/td` を読んでいた。`npm run test:fast` を**広い選択**で回すと出る(前のセッションは 90 件だけだった)。
- 再生の帯は、**1440 でも中身が 77px 広く**、横スクロールで「区間解除」が隠れていた。指示書の 112px はこの一族だと見ている。狭い窓だけでなく広い窓でも「押せる物が切れていない」を C5 で見るようにした。
- 進行の帯の見出しは、`white-space: nowrap` が無いために**中の文が折れて**高さが 47px になっていた(見出し自身は折り返していないのに、帯の高さ 148px を超えて札の下が切れていた)。折り返しを明示して、帯の高さを中身に合わせた。
- 度数を `degreeOf` の形(Ⅱm7)にすると、`displayDegreeLabel` を通しても `Ⅰmaj7` のように種類が残る。今までの `progressionPracticeDegreeLabel` はローマ数字だけだったので、テストの期待 4 か所を B で直した。
