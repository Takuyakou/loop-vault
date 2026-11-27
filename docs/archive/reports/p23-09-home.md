# P23-09 ホーム画面

## 1. ブランチとコミット

ブランチ:`feat/p23-09-home`(master `b9b16ba3` から。P23-08・P23-19 まで入っている)

| コミット | 名前 |
|---|---|
| 05ade019 | p23-09-01: the Home rebuilt to the adopted mock |
| 0e1198db | p23-09-02: carried-over fixes (X1 narrow menu label, X2 Chord Dojo dot) |
| 9de19883 | p23-09-03: e2e for the Home, and the existing checks moved to the new rules |
| (このコミット) | p23-09-04: report |

## 2. 節ごとにやったこと

- **並び(G1〜G3)**:`HomeView` を 2 列に作り直した(左 `.lv-home-col[data-col=left]` = 今日のループ → 続きから → 最近入れた進行、右 380px = 取り込む → 練習 → 自分の引き出し)。各列の最後の箱が残りの高さを取るので、下の端がそろう。1440×900・進行 8 件で縦スクロールなし(実測 `scrollHeight 808 = clientHeight 808`、下の端の差 0px)。中身の幅が 759px 以下(768×640 など)は 1 列にし、`order` で 今日のループ → 続きから → 取り込む → 練習 → 最近入れた進行 → 自分の引き出し。進行が無いときの `FirstCaptureGuide` は変えていない。
- **今日のループ(T1〜T4)**:▶(`.lv-home-loop-play`)でその場で鳴る。コードの箱は長さに比例した幅、上の線が役割の色(`progressionFunctions` を使い、キーが読める進行だけ `data-fn`)。度数はこれまでどおり。下のボタン 3 つは同じ `lv-button-neutral`(「Voicing Loop で弾く」「Chord Dojo で覚える」「開いて編集」+鉛筆の絵)。右端に `ProgressionMidiControl`(`isProgressionMidiExportEnabled()` が真のときだけ、名前「MIDI を DAW へ」)。「他のループ」と ♥ は今の働きのまま。
- **続きから(R1・R2)**:出る条件と中身(試聴・続きをやる・コードの帯)はそのまま。見た目を見本の横長の形に寄せた。帯のコード名は `ChordName`(♯ ♭ と種類 0.8 倍)。読み上げの名前は半角のまま。
- **最近入れた進行(N1〜N4)**:4 件(`HOME_RECENT_LIMIT` 5→4)。名前の下に取り込み元の印(`progressionSourceKind`)+キー・小節・いつ。小さいコードはボタンで、押すとその音(行は開かない)。「練習」の薄さ(`opacity: 0.55`)をやめた。MIDI の部品は置いていない。
- **取り込む(I1・I2)**:「MIDI から取り込む」の箱は今の形のまま、乗せると矢印が下がる。説明を「取り込むを開いてファイルを選ぶ」に。「コード譜のテキストを貼り付け」は点線の横長の箱+左のアイコン、2 行目に「Dm7 | G7 | Cmaj7 → 箱 3 つ(SD・D・T の色)」。乗せると矢印が動き、箱が左から順に明るくなる。動きを減らす設定では動かさない。
- **練習(P1〜P3)**:3 行それぞれに `HomeSummary.practiceWeek` の 7 日の印(古い日が左、今日が右)。前の「直近 5 日の点」と回数の輪はやめた。行の 2 行目は Voicing Loop =「前回 <進行の名前> ・ <いつ>」、Chord Dojo・Bass Practice =「今日 n 回」か「今日はまだ ・ 前回 <いつ>」(前回が無ければ「今日はまだ」)。前回のために `HomeSummary.lastPractised` を足した(今ある練習の記録から一番新しい日時を取るだけ。新しい記録は作っていない)。Bass Practice の行は今と同じ条件で出し、行き先も今のまま。
- **自分の引き出し(D1〜D6)**:タブ「よく開く」(最初)/「キーで聴く」(今ある `SegmentedControl`、←→ で替わる)。よく開く = `HomeSummary.topOpened` の行(順位・名前・小さいコード 4 つ・回数の棒・「n 回」。押すと進行のページ)。0 件のときだけ「今週はまだ開いていません」。キーで聴く = 五度圏の輪(`src/views/home/homeKeys.ts`、キーは `progressionKey`、読めないキーは数えない、多いほど濃い、選んだキーは緑で塗る、まん中にキー名とメジャー/マイナー、輪の下に「濃いほど多い」)。右に「◯ メジャーの進行 ・ n 件」と最大 3 行(押すとその進行が鳴る)、4 件以上は「ほか n 件を Vault で見る ›」。初めのキーは件数がいちばん多いキー(同じなら メジャーが先、輪の上(C/A マイナー)に近い方、同じ距離なら ♯ 側)。
- **持ち越し(X1・X2)**:X1 = 狭い左メニューで点のある行の `aria-label` を「Voicing Loop(今日弾きました)」の形に(`AppShell.tsx`)。X2 = 調べた結果、アプリは必ずホームから始まるが、ホームは Vault の読み込みが終わってから出るので、その前にほかの画面へ移ると Chord Dojo の記録が読まれず点が出ない道がある。直しが 1 行なので直した(`useTodayPractised` が `dojoStore.initialize()` を呼ぶ。何度呼んでも 1 回だけ読む作り)。

## 3. 指示書どおりにできなかった所・見本と違う所

- **コミットの分け方**:指示書は「並びと今日のループ/続きから・最近入れた進行・取り込む/練習/自分の引き出し/持ち越し」のかたまりごと。ホームの 3 かたまりは同じ `HomeView.tsx` と `home.css` を作り直したので 1 つのコミット(01)にした。持ち越しは 02、e2e と今あるテストの直しは 03。
- **D4「ほか n 件を Vault で見る」**:Vault に絞り込みを渡す仕組み(props・画面の引数)は今は無い(Vault の絞り込みは画面の中の覚え書き `sessionStorage` だけ)。指示書のとおり **Vault を開くだけ** にした。
- **メジャーとマイナーの切り替え**:見本には切り替えの部品が無い(輪のまん中に「メジャー」の字があるだけ)。輪の**まん中を押すと切り替わる**形にした(小さい ⇄ の印、読み上げ「マイナーに切り替える」、Tab で届き Enter/Space で切り替わる)。初めは右の列の上に切り替えの部品を置いたが、1440×900 で縦にはみ出したのでやめた。
- **今日のループのピアノロール**(見本のコードの箱の下の音の帯)は作っていない。指示書の表に無く、小さく描く部品も無い(調べの B04-3)。
- **練習の行**:見本の Chord Dojo「定番の進行 8 / 21」は、その数がホームの集計に無いので出していない。前回の日の書き方は今ある `formatWhen`(今日/昨日/M/D)で、見本の「先週」の言い方はしていない。
- **よく開くの行**:見本の ▶ の丸は付けていない(D2 で、押すと進行のページを開くため)。
- **キーで聴くの行**:見本は 2 行(名前/小節数)だが、1440×900 に収めるため 1 行(名前 … n小節)にした。
- **「◯ メジャーの進行 ・ n 件」の区切り**:指示書の字は「・」(前後に空白なし)、見本は「 ・ 」。見本に合わせた。
- **ProgressionMidiControl**:ホームで「MIDI を DAW へ」と出すため、任意の `label` を足した(`label` があるときは横のボイシングの注記を出さない)。進行のページの見た目と働きは変わらない。
- **小さい絵**:鉛筆・矢印・クリップボード・› は Lucide ではなく `HomeView.tsx` の中の SVG(同じ線の決まり)で描いた。`lint:source-contracts` は Lucide を使うファイルの `size` を 16/20 に限るので、Lucide を入れると MIDI の箱の 26px のアイコン(今の形)が残せないため。› の字(U+203A)は同じ lint で禁止なので絵にした。
- **section の名前**:見本の見出しに合わせて「今日の練習」→「練習」、「最近の進行」→「最近入れた進行」(今あるテストの直しは A として下に書いた)。
- 新しいファイルの中身を指示された物は無い(変えた行は無し)。

## 4. 今あるテストで直した行

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `src/views/HomeView.test.tsx:42` | `["続きから", "取り込む", "今日のループ", "今日の練習", "最近の進行"]` | `["今日のループ", "続きから", "最近入れた進行", "取り込む", "練習", "自分の引き出し"]` | B(並び) |
| `src/views/HomeView.test.tsx:136` | `toHaveLength(5)` | `toHaveLength(4)` | B(4 件) |
| `src/views/HomeView.test.tsx:179` | `section[aria-label='今日の練習']` | `section[aria-label='練習']` | A |
| `src/views/HomeView.test.tsx:180` | `toContain("今日 1回")` | `toContain("今日 1 回")` | B(見本の数の書き方) |
| `src/views/HomeView.test.tsx:181` | `[data-testid='home-practice-streak']` の文に「連続」が無い | Chord Dojo の行の `home-practice-week` の文に「連続」が無い | B(5 日の点 → 7 日の印) |
| `src/views/HomeView.test.tsx:182` | `.lv-home-dot[data-practiced='true']` が 2 つ | Chord Dojo の行の `home-practice-week i[data-practised='true']` が 2 つ | B(同上) |
| `e2e/p22-03-home.spec.ts:115` | `コード採集を開いてファイルを選ぶ` | `取り込むを開いてファイルを選ぶ` | B |
| `e2e/p22-03-home.spec.ts:125` | `section[aria-label='今日の練習']` | `section[aria-label='練習']` | A |
| `e2e/p22-03-home.spec.ts:137` | 2 行目に `[role='img'][aria-label='今日の回数']` が 1 つ | 2 行目の `home-practice-week` の印が 7 つ | B(回数の輪 → 7 日の印) |
| `e2e/p22-03-home.spec.ts:138` | `home-practice-streak` の `aria-label` が「直近 5 日の練習した日」 | 見出しの「この 7 日」が見える | B(同上) |
| `e2e/p22-03-home.spec.ts:147` | `/今日 [1-9]\d*回/` | `/今日 [1-9]\d* 回/` | B(見本の数の書き方) |
| `e2e/p22-03-home.spec.ts:156` | `/前回 (今日\|昨日\|\d+\/\d+)/` | `/前回 .+ ・ (今日\|昨日\|\d+\/\d+)/` | B(「前回 <名前> ・ <いつ>」) |
| `e2e/p23-08-home-records.spec.ts:188` | `.exclude(".lv-home-recent-actions")` | (消した) | N3 |

基準の写真 `home`(進行が無いときのホーム)は更新していない(§6 の `visual.spec.ts` がそのまま通った)。

## 5. 新しいテスト

単体 = `src/views/home/HomeViewP2309.test.tsx`(以下「単体」)、`src/views/home/homeKeys.test.ts`、`src/components/AppShellTodayLabel.test.tsx`。e2e = `e2e/p23-09-home.spec.ts`(以下「e2e」)。

| # | 確かめたこと | テスト |
|---|---|---|
| C1 G1 | 左右の列の中身と順・右が 380px で右にある | 単体「G1: the left column is …」、e2e「C2/G2: …」 |
| C1 G2 | 下の端がそろう | e2e「C2/G2: …」 |
| C1 G3 | 768×640 で 1 列・決めた順・左の端がそろう | e2e「G3/C8: …」 |
| C1 T1 | ▶ が `timeline` で鳴る・箱が `chord` で鳴る・キーがあるときだけ役割の色(SD・D・T) | 単体「T1: ▶ plays …」「T1: the chord boxes take the role colours …」 |
| C1 T2 | 3 つが同じ class(neutral)・主ボタン無し・鉛筆の絵・「Vault で開く」「V」無し・行き先 | 単体「T2: three buttons of the same weight …」 |
| C1 T3/N4 | 今日のループにだけ「MIDI を DAW へ」・`false` の設定で出ない・最近入れた進行に無い | 単体「T3: 「MIDI を DAW へ」 sits in 今日のループ only …」 |
| C1 T4 | 入れ替え・♥ | 今あるテスト `HomeView.test.tsx`「swaps today's loop with an undo toast」「toggles the loop's favorite …」、`e2e/p23-02-toast.spec.ts`(今回の確かめには入れていない) |
| C1 R1 | 出る条件・中身 | 今あるテスト `HomeView.test.tsx`・`e2e/p22-03-home.spec.ts`・`e2e/p89-home-continue.spec.ts` |
| C1 R2 | 帯の名前が「C♯m7♭5」「B♭7」、♯ が `ChordName` の部品、読み上げは半角 | 単体「R2: the strip writes ♯ and ♭ …」 |
| C1 N1 | 4 行・取り込み元の印(MIDI/テキスト/Live MIDI) | 単体「N1: four rows with where each came from」 |
| C1 N2 | 小さいコードが鳴り、行は開かない | 単体「N2/C7: …」、e2e「C7/N2: …」 |
| C1 N3 | 「練習」の不透明度が 1・axe を何も外さず 0 件 | e2e「N3: …」「G3/C8: …」、`e2e/p23-08-home-records.spec.ts` E6(`.exclude` を消した) |
| C1 I1/I2 | 説明の文・テキストの箱の中身と色・乗せたときの矢印と箱(左から遅れて)・動きを減らす設定で動かない | 単体「I1/I2: …」、e2e「I1/I2: hover moves …」 |
| C1 P1/P2/P3 | 7 日の印・5 日の点と輪が無い・「前回 進行 p2 ・ 昨日」「今日 1 回」「今日はまだ」・Bass の行の条件と行き先 | 単体「P1/C5: …」「P2: …」「P3: …」 |
| C1 D1〜D6 | 下の C4・C6 と、単体「D3: denser for more …」「D4: four or more …」、`homeKeys.test.ts` の 4 つ(キーの読み方・♯♭ の名前・初めのキー・新しい順) |
| C1 X1 | 狭いメニューの名前「Voicing Loop(今日弾きました)」、広いときは `aria-label` 無し | `AppShellTodayLabel.test.tsx` の 2 つ、e2e「X1: at 1024×768 …」 |
| C1 X2 | `useTodayPractised` が Chord Dojo の記録を読み込む | 単体「X2: the side menu's dots load the Chord Dojo records themselves」 |
| C2 | 1440×900・8 件で縦スクロールなし・下の端の差 1px 以内(よく開く/キーで聴くの両方) | e2e「C2/G2: …」 |
| C3 | 1 件:今日のループがその 1 件・1 行・「今週はまだ開いていません」・そのキーだけ濃い | 単体「C3: …」 |
| C4 | 3・2・1 回 → その順に 3 行と回数、押すと進行のページ / 1 件 → 1 行 / 0 件 → 文 | 単体「D1/D2/C4: …」「C4/D2: …」、e2e「C4 (in the app): …」(実際に練習を開いて 2 回・1 回) |
| C5 | 3 日前の Voicing Loop → 左から 4 つ目だけ | 単体「P1/C5: …」 |
| C6 | C メジャー 3・A マイナー 1 → 初めは C、まん中「C」、「C メジャーの進行 ・ 3 件」と 3 行、マイナーにして A → 1 行 | 単体「D3–D6/C6: …」 |
| C7 | 今日のループと最近入れた進行のコードが鳴り(`playbackController.toggle` の `chord`)、進行のページへ移らない | 単体「N2/C7: …」「C7: …」、e2e「C7/N2: …」 |
| C8 | 1440×900・1280×720・1024×768・768×640 で横にはみ出さない、axe serious・critical 0(8 件、外す所なし) | e2e「G3/C8: …」 |
| C9 | Tab で `#main-content` の全部の操作に届く、タブが ←→ で替わる | e2e「C9: …」、単体「C9: the drawer tabs switch with ← →」 |

## 6. 最後の確かめ

| コマンド | 結果 |
|---|---|
| `npm run lint` | 通った |
| `npm run build` | 通った |
| `npm run test:fast -- src/views/HomeView.test.tsx src/views/home src/components/AppShell.test.tsx src/components/AppShellTodayDot.test.tsx src/components/AppShellTodayLabel.test.tsx` | FAST: PASS — Vitest selected 6649/6651(2 は前からの skip)— 107.5s |
| `npm run test:ui -- e2e/p22-03-home.spec.ts e2e/p23-08-home-records.spec.ts e2e/p23-07-command-palette.spec.ts e2e/visual.spec.ts e2e/accessibility.spec.ts e2e/keyboard.spec.ts e2e/responsive.spec.ts e2e/p12-dojo-home-layout.spec.ts e2e/p20-dojo-home.spec.ts e2e/p22-01-home.spec.ts e2e/p89-home-continue.spec.ts e2e/p23-09-home.spec.ts` | UI: PASS — Playwright selected 90/90(落ちた数 0)— 72.4s |

`test:fast` には指示書の 4 つに、新しい `AppShellTodayLabel.test.tsx` を足した。`test:ui` には名前に `home` を含む spec を全部足した。FULL は回していない(指示書のとおり)。

## 7. 写真

`p89-generated/p23-09/`(git に入れていない)。進行 0・1・9 件 × 1440×900・1280×720・1024×768・768×640(狭い幅はスクロールした続きの `-scroll1`・`-scroll2` も)、`home-9-1440x900-keys.png`(キーで聴く)、`home-hover-text.png`(テキストの箱に乗せたとき)。

自分の目で見た写真:`home-9-1440x900.png`、`home-9-1440x900-keys.png`、`home-9-1280x720.png`、`home-9-1024x768.png`、`home-9-1024x768-scroll1.png`、`home-9-768x640.png`、`home-9-768x640-scroll1.png`、`home-9-768x640-scroll2.png`、`home-1-1440x900.png`、`home-0-1440x900.png`、`home-hover-text.png`。

## 8. 気づいたこと(直していない)

- 通常の形でテキストから保存した進行は、取り込み元の印が「MIDI」になる(調べの B04-6 のとおり `textSource` が付かない)。写真の進行もテキストで入れたが、全部「MIDI」と出ている。
- Chord Dojo の「今日 n 回」(`dojo.today.matched`)と 7 日の印(P23-08 の `item.recent` から)は数え方が違う。「弾けた」を 1 回押しただけだと「今日 1 回」なのに今日の印は付かない(P23-08 の報告の 9 のとおり。記録は変えていない)。
- `e2e/p23-08-home-records.spec.ts` の E6 の上のコメント(「0.55 で薄い」)は、消した `.exclude` の行の説明なので古くなった(指示書で直してよいのは `.exclude` の 1 行だけなので残した)。
- テキスト取り込みは、続けて保存すると前に選んだキーが残ったままになる(写真を撮る途中で、キーを選ばずに保存した進行に前のキーが付いた)。
- 1280×720 以下は縦にスクロールする(C2 は 1440×900 だけの決まり)。1024×768 では今日のループの名前が長いと「…」で切れる。
- 見本の今日のループには音のピアノロールがあるが、今回は作っていない(上の 3)。作るなら `resolveTimelineVoicings` の音から描ける。
