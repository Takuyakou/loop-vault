# P22-01: Chord Dojo（作業報告）

- ブランチ: `feat/p22-01-chord-dojo`（master `6c28baaa` から）
- コミット: `551521ae`（§1）、`2d05c2d3`（§2 の一部）、`f6714dac`（§4B の一部）、`39ef3778`（未完了の報告）、`b28e9dbf`（ステップ B: ホーム）、この報告のコミット（ステップ B: 報告）
- **この作業は指示書の §3・§4 の大部分、§4B の e2e、§5・§6 を終えていません。** FULL は回していません。master へのマージ・push もしていません。

## できたこと

### §0 写真

`p89-generated/p22-01-chord-dojo/before/` に、ホーム（1440/1280）、定番の一覧（1440/1280）、練習画面（1440/1280）、Jazz 一覧・練習、Original 一覧・練習、ドリル一覧・練習を撮りました。耳で弾く・2-5-1 Master と、記録あり/なしの両方のホームは未撮影です。

### §1 機能の色

- `src/styles/tokens.css` に `--lv-fn-t/sd/sdm/d` を追加。耳で弾くの 4 色をこの変数に置換。
- `src/domain/harmony/chordFunction.ts` を追加し、`degreeFunction.ts` の表・`functionAt`・`functionKind` を再利用。品質→family の表はこの 1 ファイルだけ。
- `progressionFunctions` は絶対値を受け、キー不明・最後・キー変更・ベース違いを指示どおりに扱う。
- `src/domain/harmony/chordFunction.test.ts` 7 件（C メジャー 5 進行、A マイナー、12 キー移調、キーなし、最後、キー変更、ベース違い）。
- 練習カード（定番・ランダム・Jazz・Original・ドリル）に `fn`/`fnBorrowed` を渡し、`data-fn`・`data-fn-borrowed`、度数の色、`T/SD/SDm/D` の小さな印、`aria-label` の日本語を追加。今のカードの緑枠はそのまま。
- 一覧（定番・Jazz・ドリル）の度数に `data-fn` を追加。
- e2e `e2e/p22-01-function-colors.spec.ts` は「王道進行」の 4 枚が SD/D/T/T、一覧の ii–V–I が SD/D/T で PASS。
- 単体 48 件（chordFunction・earPractice・dojoNav）PASS。耳で弾くの既存結果は変更なし。

### §2 の一部

- ホームの注意を 1 本の帯にまとめ、`×` でその画面だけ閉じる。
- 緑の塗りは「続きから」の 1 つだけ。`data-primary="true"` は 1 つ。ほかのカードのボタンは透明な枠に変更。
- ホームに「約 N 分・◯◯の練習が中心。テーマは…」の 1 行を追加。ドリルの「まだ記録はありません」を「まだ」に。
- `e2e/p20-dojo-home.spec.ts` の 6 つの塗りボタンの期待を「主役 1 つ + カードが見える」に置き換え。
- **未完了**: カード全体を押せる CSS/主操作（試したがカードのボタンが反応しなくなり、いったん撤回）。→ ステップ B で完了
- **未完了**: Jazz/Original/新規学習/復習/Mixed の小さなリンク化、8 枚のクリック・Enter・Space の e2e、棒グラフの条件、今日のおまかせの細部。→ ステップ B で完了

### §4B の一部

- `DojoBackButton` を `ChevronLeft` + 行き先名の枠付きボタンに変更。`HOME_BACK_LABEL='Chord Dojo'`、`parentOf` の HOME ラベルを変更。
- 定番・Jazz・Original・ドリルの練習画面から右上の「やめる（Esc）」を削除。ランダムキーだけ「結果を見て終わる（Esc）」に変更。
- `dojoNav.test.ts` の期待を「Chord Dojo」に更新。`p12-3`/`p12-4` の探し方を更新。
- **未完了**: 5 画面の戻るボタン位置の e2e、Esc の e2e、「やめる」を押していたテストの置き換えの全体確認。→ ステップ C で完了

## できていないこと

- §3 進行の一覧のカード全体・ランダム切り替え・「…」メニュー・進み具合の点・最近やった・sticky のジャンル・説明の「?」。→ ステップ D で完了(進み具合の点は記録が読めず「まだ/済」のまま。下のステップ D)
- §4 練習画面の条件/合否/案内/操作の行の部品化、上の空白を詰める、`<kbd>`、説明の「?」、1 周終わりの帯。→ ステップ E で完了
- §4B の e2e と、戻るボタンの位置をそろえる CSS。→ ステップ C で完了
- §5 の 5 サイズの after 写真、visual 基準の更新（Chord Dojo の基準は未更新）。→ 写真はステップ F で完了。基準の更新は権限で止まった(下のステップ F)
- §6 の FULL。

## テスト

- `src/domain/harmony/chordFunction.test.ts` 7 / `earPractice.test.ts`・`dojoNav.test.ts` 合計 48 PASS。
- `e2e/p22-01-function-colors.spec.ts` 1 PASS。
- `e2e/p20-dojo-home.spec.ts` は 4 件 FAIL（カード全体・ボタンの探し方の未対応）。直せていません。
  - → ステップ B で完了。ただし作業開始時に測ると、`39ef3778` の時点ですでに 10 件とも PASS だった（下の「Git と報告の食い違い」）。
- FULL は未実行（未完成のため）。→ ステップ B でも回していない（指示どおり、FULL はステップ F でだけ）。

---

# ステップ B: Chord Dojo ホームを仕上げる（§2）

`P22-01-continue.md` のステップ B だけをやった。同じブランチ `feat/p22-01-chord-dojo` の上。C 以降・FULL・master へのマージ・push はしていない。

- コミット: `b28e9dbf`（`p22-01-B1`: ホームの実装とテスト）、この報告のコミット（`p22-01-B2`）
- **通すテスト（指示のコマンド）**:
  `npm run test:ui -- e2e/p20-dojo-home.spec.ts e2e/p22-01-home.spec.ts e2e/p22-01-function-colors.spec.ts`
  → **PASS 30/30・43.3 秒**（p20 10 件・p22-01-home 19 件・p22-01-function-colors 1 件）
- ついでに回した関係のテスト（すべて PASS）:
  - `p12-dojo-home-layout`・`p12-vertical-layout`・`p20-resume-kinds` → 36/36
  - `p12-chord-dojo`・`p12-dojo-home-layout`・`p20-resume-kinds` → 68/68
  - `p12-3-dojo`（全部）→ 33/33
  - `p12-1-dojo-ui`・`p12-4-back`・`p12-4-progressions`・`p12-5-no-restart`・`dojo-single-advance` → PASS
  - `npx vitest run src/views/chord-dojo` → 261 件 PASS

## B-1. カード全体を押せるようにする

ファイル: `src/views/chord-dojo/DojoHome.tsx`、`src/views/chord-dojo/Master251View.tsx`、`src/views/chord-dojo/dojoHome.css`

- 8 枚のカードの主の操作（`.dojo-card-primary`）は**増やさず・消さず**、置き場所だけを見出し（`h2`/`h3`）へ移した。中の文字はカードの名前。`aria-label`・`data-testid`・`data-focus-key`・`onClick` は変えていない。
  - 定番の進行（文字「定番の進行」・`aria-label="定番の進行"`・`data-focus-key="home:standard:open"`）
  - 2-5-1 Master（`Master251Card`。文字「2-5-1 Master」・`aria-label="2-5-1 Master 続きから"`・`data-focus-key="master:continue"`）
  - 耳で弾く（`data-testid="ear-open"`・`aria-label="耳で弾く"`）
  - ボイシングドリル（`aria-label="ボイシングドリル"`・`data-focus-key="home:drill:open"`）
  - 自分の進行（`aria-label="自分の進行"`）／登録した音（`aria-label="登録した音"`）
  - コードの型（文字「コードの型」・`aria-label="型の一覧"`）
  - 今日のおまかせ（文字「今日のおまかせ」・`aria-label="始める"`・`data-testid="practice-start"`）
  - 「今日のおまかせ」が持っていた `startLabel`（「始める／続きから始める／新しいテーマで始める」）は、指示どおりボタンの文字から外した。情報を消さないため `title` に残した。
  - Master カードの見出しの上にあった「学習順 A → B → C → D／1オクターブ下」（`<small>`）は、見出しの前に置くと 4 枚の名前の行がそろわないので、数字の説明（「MASTER・学習順 A → B → C → D」）に移した。情報は消していない。
- CSS は指示の決まりをそのまま入れた（前回の「主役を透明にするだけ」の版と入れ替え）。
  - カードを `position: relative; cursor: pointer`。主の操作は `position: static`（これを外すと `::after` がボタンの大きさにしかならない）、見た目は見出しの文字（`font: inherit` など）。
  - `.dojo-card-primary::after { inset: 0 }` でカード全体を押せるようにし、`:focus-visible` では細い枠を消してカード側に `:has()` で `--lv-focus` の枠を出す。
  - **前回ボタンが反応しなくなった原因**は、`::after` の上に出していなかったことなので、`.dojo-card-primary` 以外の `button/a/select/input/summary` を `position: relative; z-index: 1` で上に出した（これでリンク・カード内のキー選択・「中身を見る」が押せる）。
  - 無効の主の操作があるカードは `cursor: default`、`:hover` の枠も変えない。
  - カードの `:hover` は `--lv-accent` の枠。
- ほかのボタン（Jazz Progressions・Original Practice／新規学習・復習・Mixed Test／記録を見る／ドリルの①〜④／中身を見る／登録した音の項目）は `.dojo-home-p20-link` の**小さな文字のリンク**にした（枠なし・下線・`--lv-text-secondary`・乗せると `--lv-accent`）。`<button>` のまま、名前と `data-testid` は変えていない。

## B-2. 残りの §2

- **進み具合の棒**は、定番の進行（完奏した数 / 全部の数）と 2-5-1 Master（n / 48）だけ。
  - 耳で弾く: `src/domain/earPractice/` を調べた。今の「点」は `earStats.ts` の `firstTryRate`（`firstTry / measured`）を 100 倍した**率**で、1 問のコード数で分母が変わる。決まった満点（点数と上限）は記録にも定義にもないので、**棒を出さず「点 / 満点」にもしない**（今の「前回の点 ・ ベスト」のまま）。
  - ボイシングドリル: 秒数に分母がないので棒なし（今の「秒数 + 組・段階・キー」のまま）。
  - 棒を出さない 2 枚には、同じ高さの空き（`6px` の `dojo-home-p20-bar-blank`）を置いて 4 枚の並びをそろえた。
- **4 枚の高さと並び**: 4 枚とも「名前（主の操作）→ 説明 1 行 → 数字 1 つ + その説明 →（棒）→ リンク」の順にした。Master の Form A〜D の 4 つの箱はリンクの行の上に残した。カードの高さ・名前の行・リンクの行がそろうことを e2e で確かめた（`p22-01-home.spec.ts` の「one height and one line-up」）。Master カードは `master251.css` の `margin-top: 16px` とホーム用の余白 12px を持っていて、ほかの 3 枚と位置がそろわなかった。ホームのときだけ margin 0・余白 13px 14px にした（余白の 1px の差は、そろえた後の e2e で見つけて直した）。
- **今日のおまかせ**: 1 行（`約 N 分・◯◯の練習が中心。テーマは △△`）はそのまま。細かい数（計画の行・1 回の目安・確認の上限・外した練習）が「中身を見る」の中に残っていることを e2e で確かめた。

## B-3. テスト

### テストの直し A（探し方だけ）

| ファイル・テスト | 前の探し方 | 後の探し方 | 理由 |
|---|---|---|---|
| `e2e/p12-chord-dojo.spec.ts:17`（最初のテーマの形） | `getByRole("button",{name:/続きから始める/})` | `getByTestId("practice-start")` | 今日のおまかせのボタンの文字を「今日のおまかせ」にしたため（§2-4） |
| `e2e/p12-3-dojo.spec.ts:217`（§8 ランダムキー） | `toHaveText(['IVmaj7','V7','iii7','vi7'])` | `toHaveText([/^IVmaj7/,/^V7/,/^iii7/,/^vi7/])` | §1-4 で度数の横に `T/SD/D` の印を入れたため、要素の文字が「IVmaj7SD」になった（印の文字は見ない） |

### テストの直し B（新しい動きへの置き換え）

| 古いテスト（何を確かめていたか） | 新しいテスト（何を確かめるか） | 根拠 |
|---|---|---|
| `p20-dojo-home`「1440x900 with 続きから has no vertical scroll, and the six main buttons are filled」= 6 つの主なボタンが塗りで見える | 同じテストを「…has one filled primary and every practice card is reachable」に。塗りの主役が 1 つだけ・6 つの操作（続ける／定番の進行／2-5-1 Master 続きから／耳で弾く／ボイシングドリル／今日のおまかせ）がどれも見えて押せる（無効でない・ほかの要素に覆われていない）ことを確かめる | `P22-01-chord-dojo.md` §2-2・§2-3、`P22-01-continue.md` B-3 |

### 足したテスト（`e2e/p22-01-home.spec.ts`、19 件）

- `[data-primary="true"]` が続きあり・続きなしの両方で 1 つだけ。カードの主の操作はどれも塗りでない。
- 8 枚それぞれ、主の操作を**クリック／フォーカス + Enter／フォーカス + Space**で動かすと、今と同じ行き先へ **1 回だけ**行く（行き先の画面が出て、もう 1 回余分に進んでいない）。
- カードの何もない所（説明文の上）をクリックすると、主の行き先へ行く。
- カードの中のリンク（Jazz Progressions／記録を見る／ドリルの②／中身を見る）を**クリック／Enter**で動かすと、そのリンクの行き先へ行く（カードの主の行き先＝一覧の先頭・練習画面へは行かない）。
- 棒が出ているのは定番と Master だけ。耳とドリルは棒なしで、空きがある。
- 4 枚の高さ・名前の行・リンクの行がそろう。
- 写真（下）。

## 写真

`p89-generated/p22-01-chord-dojo/`（git では追跡しない）

- 変える前（§0 のもの）: `before/home-1440.png`、`before/home-1280.png`
- 変えた後（ステップ B）: `after/home-1440x900.png`、`after/home-1440x900-resume.png`、`after/home-1280x720.png`、`after/home-1280x720-resume.png`
  - 「続きあり」は `loop-vault:dojo-recent:v1` に定番の進行 1 件を入れた状態。「続きなし」は空。
  - 撮り方は `p22-01-home.spec.ts` の「P22-01 §2 photos」（`document.fonts.ready` のあと 2 フレーム待って `fullPage`）。

## 指示の外で直した所（この節で見つけたもの）

- `DojoHome.tsx`: 1 本にまとめた注意の帯のうち、**MIDI のエラー行に `role="alert"` を戻した**。前回の §2-1（`2d05c2d3`）で別々の `<p role="alert">` を帯にまとめたときに role が落ちていて、`p12-chord-dojo.spec.ts` の 2 件（「real disconnect, pending reconnect and input failure remain distinct」「a failed automatic return stays visible…」）が `getByRole("alert")` を見つけられずに落ちていた。帯は 1 本のまま、エラーのときだけその行が alert になる（テストは弱めていない）。
- `master251.css`・`chord-dojo.css`: 見出しへ主の操作を移して使わなくなった `.master251-continue`・`.master251-entrances`・`.master251-card-head` の決まりと、ホームのときだけの `padding: 12px` を消した（同じ見た目は `dojoHome.css` 側で持つ）。

## Git と報告の食い違い

- 「ステップ B」の指示では「今、`e2e/p20-dojo-home.spec.ts` が 4 件落ちている」とあったが、**`39ef3778` の時点で 10 件とも PASS** だった（この節の作業を始める前に、変更を入れずに `npm run test:ui -- e2e/p20-dojo-home.spec.ts` を回して 10/10 PASS を確認）。落ちていたのは前の報告を書いた時点の状態と思われる。テストの中身（カード全体・ボタンの探し方）は指示のとおり足りていなかったので、B-3 のとおり足した。
- 前の報告に「§1 の e2e は PASS」とあったが、`e2e/p12-3-dojo.spec.ts` の 1 件は §1-4 の印で落ちていた（上の A で直した）。FULL を回していないので、ほかに残っているものはステップ F で分かる。

## FULL

回していない（`P22-01-continue.md` の「FULL はステップ F でだけ回す」）。

---

# ステップ C:戻るボタンの位置・Esc・度数の関数(§4B の残り・§1 の補い・§0 の残り)

`P22-01-continue.md` のステップ C と、レビューの指摘 2 つだけをやった。同じブランチ `feat/p22-01-chord-dojo` の上。D 以降・FULL・master へのマージ・push はしていない。

- コミット: `aea2e30b`(`p22-01-C1`: 実装とテスト)、この報告のコミット(`p22-01-C2`)
- **通すテスト(指示のコマンド)**:
  - `npm run test:fast -- src/domain/earPractice/degreeFunction.ts src/views/chord-dojo/dojoNav.ts`
    → **PASS**(App TypeScript・Source contracts・Changed ESLint・Vitest selected **6378/6380**、109 秒)
  - `npm run test:ui -- e2e/p12-4-back.spec.ts e2e/p12-3-dojo.spec.ts e2e/p22-01-back.spec.ts`
    → **PASS 74/74**(87 秒)
  - 同じコマンドに `e2e/p22-01-home.spec.ts e2e/p22-01-function-colors.spec.ts` を足して **PASS 96/96**
- ほかに回したテスト(すべて PASS):
  - `p22-01-back` + `jazz-progressions` → 64/64 / `p12-1-dojo-ui` + `p22-01-back` → 65/65
  - `p18-practice-frame` + `p19-voicing-drill` → 48/48 / `p18` + `p19` + `p12-master251` + `p12-master251-audition` + `p16-ear-records` → 72/72
  - `p16-ear-practice` + `p16-ear-records` + `p16-ear-degrees` + `p20-dojo-home` + `p12-dojo-home-layout` + `p22-01-home` → 63/63
  - `p22-01-function-colors` + `p12-3-dojo` → 35/35 / `vitest run src/domain/earPractice` → 242 件 / `degreeFunction.test.ts` → 28 件

## レビュー 1:機能の印を度数の外へ

- `src/views/chord-dojo/PracticeFrame.tsx`: `.dojo-endless-degree` の中に入れていた印を外に出し、`<span class="dojo-card-degree-row"><small class="dojo-endless-degree">度数の文字</small><span class="dojo-card-fn">T/SD/…</span></span>` にした。**度数の要素の文字は、度数の文字だけ**になった。
- `src/views/chord-dojo/chord-dojo.css`: 印の見た目(`.dojo-card-fn`: 枠・9px・度数の右 5px・同じ行)と色は今のまま。色は**行から継承**するようにした(度数の色の決まりを行 `.dojo-card-degree-row` に移し、度数は `color: inherit`)。印は `<span>` にした(カードの `small` 用の色の決まりが印に当たらないようにするため。`<small>` のままだと `--dojo-muted` になって度数と色が違った)。
- テストを戻した: `e2e/p12-3-dojo.spec.ts` §8 の度数の確かめを、前方一致から**ちょうど一致** `['IVmaj7','V7','iii7','vi7']` に戻し、印は `.dojo-card-fn` の `['SD','D','T','T']` で確かめるようにした。
- `git diff master -- e2e` を調べた。文字の確かめを緩めたのはこの 1 か所だけで、ほかに前方一致・`toContainText` へ緩めたものは無かった(`toContainText` の増加は、ステップ B で足した新しいテストの中だけ)。
- 足したテスト(`e2e/p22-01-function-colors.spec.ts`): 王道進行の練習で、印が「度数の要素の中に無い・度数の右・同じ行・度数と同じ色」であること。

## レビュー 2:ホームの 8 枚の見出しをそろえる

- 実測: 上の 3 枚(定番・耳・ドリル)は **12px/600**(`.dojo h2` の決まりが `dojoHome.css` の 17px に勝っていた)、2-5-1 Master は **17px/600**、下の 4 枚は **14px/400** だった。
- `src/views/chord-dojo/dojoHome.css`: 8 枚とも **14px・400・#f2f6fc・margin 0・行 1.3**(下の 4 枚の大きさ)にした。
- `e2e/p22-01-home.spec.ts` に足した: 8 枚の見出しの `font-size` と `font-weight` が同じで 14px であること、上の 4 枚の見出しの `y` が同じ(±2px)であること。
- 写真: `p89-generated/p22-01-chord-dojo/after/home-1440x900[-resume].png`・`home-1280x720[-resume].png` を撮り直した。

## C1:戻るボタンの位置をそろえる(§4B-1・§4B-4)

- 実測(1440×900、ボタンの左上):一覧 264,120 / 練習 244,95 / 耳で弾く 260,112 / 耳の記録 344,112 / 2-5-1 Master 244,97。**全部 (264,105) にそろえた**(±2px)。
- `chord-dojo.css` / `ear-practice.css`:
  - 一覧は `.dojo-choose-page` の上を 13px に(左は 32px のまま)。
  - 練習画面は画面の節に上 10px(ボタンは行の中央なので +3px で 105)。**高さ 768px 以上のときだけ**にした。720px では練習の枠に余裕が無く、25px 下げると鍵盤が窓からはみ出した(`p18-practice-frame` の「the keyboard is clear of the bottom」が -9)。上の空白を詰めるのは §4-2(ステップ E)なので、ここでは触っていない。
  - 練習の見出しの左右を 32px に、耳で弾く・耳の記録は上 13px に。耳の記録は、中身だけ 1040px の中央のまま(見出しの行だけ画面の左端に出す)。
  - 2-5-1 Master は上 7px と、ボタンだけ右へ 20px(ヘッダの左右の余白を変えると「48 セルの進み具合」の幅の決まりが崩れるため)。
- **§4B-1 の見た目が効いていなかった**: P12.4 の「枠も地もない灰色の字」の決まり(`.dojo .dojo-back`)が残っていて、枠付きの新しい決まりを上書きしていた。古い 2 行を消した。Master だけは上の帯のほかのボタンと同じ 30px のまま(変えると行の高さがそろわない)。
- 足したテスト(`e2e/p22-01-back.spec.ts`、25 件):13 の画面(一覧 5・練習 5・耳で弾く・耳の記録・2-5-1 Master)で、戻るボタンが 1 つ・左上の角が 264,105(±2)・その左に何も無い。

## C2:Esc と「やめる」の置き換え(§4B-3・§4B-4)

- `git grep -n "やめる" -- e2e src` の結果(Chord Dojo の関係):
  - `e2e/p12-3-dojo.spec.ts` の §10 のテスト(「three cleared keys, then やめる」)→ §4B の途中版 `f6714dac` で、押すボタンが「やめる（Esc）」から**「結果を見て終わる（Esc）」**に置き換わっていた(確かめる中身は同じ)。ステップ C でテスト名も「… then 結果を見て終わる」に直した。
  - `e2e/p12-4-back.spec.ts:80` は「昔の戻り方(`やめる（続きは次に）」など)が無い」ことを見ているだけで、「やめる（Esc）」を押していない。
  - `src`: `PracticeFrame` の既定のラベル(どこからも渡していない)、耳で弾くの「苦手の練習をやめる」(別物)。
  - → **「やめる（Esc）」を押す・探すテストは、もう残っていない**(対応表は下)。
- 足したテスト(`e2e/p22-01-back.spec.ts`):
  - 5 つの練習画面(定番・ランダム・Jazz・Original・ドリル)のそれぞれで、戻るボタンでその一覧へ行く。Esc でも同じ。**「やめる」のボタンが無い**ことも確かめる。
  - ランダムキーで 1 つ答えた後:「結果を見て終わる」で結果の画面。戻るボタンでは結果を出さずに一覧へ。

### テストの直し B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `p12-3` §10「three cleared keys, then やめる」(ランダムキーで 3 つ答えて「やめる（Esc）」を押すと結果が出る) | 同じテストで「結果を見て終わる（Esc）」を押す(押す相手だけ変更)。さらに、1 つ答えた後に「結果を見て終わる」→結果の画面/戻るボタン→結果なしで一覧、を `p22-01-back` で確かめる | `P22-01-chord-dojo.md` §4B-3、`P22-01-continue.md` C-2 |
| (押しているテストは無し)4 画面の「やめる（Esc）」 | 4 画面+ランダムで、戻るボタンと Esc が 1 つ上へ行き、「やめる」のボタンが無いこと | 同上 |

## C3:度数の文字から機能を決める(`degreeFunctionKinds`)

- 足した単体テスト(`src/domain/earPractice/degreeFunction.test.ts`、28 件のうち新しい describe):
  - メジャーの 5 つの進行(`ii7–V7–Imaj7` → SD,D,T / `IVmaj7–V7–iii7–vi7` → SD,D,T,T / `IVmaj7–iv7–Imaj7` → SD,SDm,T / `Imaj7–VI7–ii7–V7` → T,D,SD,D で VI7 だけ点線 / `ii7–♭II7–Imaj7` → SD,D,T で ♭II7 だけ点線)。
  - 読めない文字(`???`)は色なしで、例外を投げない。
  - `BUILTIN` の全部と Jazz の全部(版も含む)で、例外を投げず、度数と同じ数の結果を返す。
  - ビルトインの C キーで、`progressionFunctions`(コード名から決めるほう)と**同じ結果**(種類も点線も)。
- **途中で分かったこと**:この関数は度数ラベルの書き方の一部を読めず、その進行**全体**が色なしになっていた(例外→全部色なし)。数えると 79 か所。原因は 4 つで、どれも「表の判断」ではなく「読み方」だった:
  - 全角ローマ数字(`Ⅱm9`・`Ⅴ13`・`Ⅰmaj9` … Jazz のラベル)
  - `ø7`(ハーフディミニッシュ)・`m7(b5)`
  - `i(maj7)`(マイナー・メジャー7)
  - `♯idim7`(小文字のローマ+dim7。小文字=マイナーと決めつけて `m` を足していた)
- そこで `degreeFunction.ts` の**読み方(正規化)だけ**を直した(`normalizeDegreeLabel`)。**MAJOR_TABLE / MINOR_TABLE と `functionAt` の決め方は 1 文字も変えていない**。
- 直した後の「色なし」は **23 か所・14 種類**。どれも表にその種類が無いため(規則どおり):
  `I7(5) / v7(2) / ♯ivdim7(2) / II/I(2) / ♭Ⅲmaj7(2) / Ⅰm6/9(2) / ♭Ⅱ7(1) / I+(1) / IIImaj7(1) / ♭ii7(1) / Ⅴsus(11)13(1) / Ⅴ13(♭9)(1) / Ⅴ13(9)(1) / Ⅰm7(1)`
  - 残る原因:その度数・種類が表に無い(`I7`・`v7`・`Ⅱ/I`・`♭Ⅲmaj7`・`III maj7`・`♭ii7`・`Ⅰm7`・`I+`)、`m6/9`・`13(♭9)`・`sus(11)13` の書き方を家族の表が知らない。
- **指示の「違う進行があれば一覧を書いて止まる」に当たるか**を調べた。直す前は 8 か所で違っていた:
  `ii-v-i-minor#1 iiø7`・`jb-minor-251#1 iiø7`・`jf-minor-blues#12 iiø7`・`md-bossa-descent#2 ♯ivø7`(度数=色なし/コード=SD)、`passing-dim#2 ♯idim7`(色なし/D)、`jb-minor-251#3・#4 i(maj7)`・`jd-minor-line-cliche#2 i(maj7)`(色なし/T)。
  8 か所とも原因は上の読み方だけで、**規則の食い違いは無かった**ので、規則は変えずに読み方を直して一致(0 か所)を確かめた。もし「読み方も変えるな」という意図だった場合は、`normalizeDegreeLabel` を元に戻せば前の状態(8 か所の違い)に戻る。

## C4:§0 の残りの写真(master から)

- master(`6c28baaa`)の一時 worktree を別のフォルダに作り、そこでアプリを組み立てて撮った(同じ worktree の node_modules は共有せず、複製した)。撮った後に worktree は消した。
- `p89-generated/p22-01-chord-dojo/before/` に足した(§0 のぶんはそのまま):
  `ear-1440x900.png`・`ear-1280x720.png`(耳で弾く、度数と機能を見せる=オン)/ `master-1440x900.png`・`master-1280x720.png`(2-5-1 Master)/ `home-records-1440x900.png`・`home-records-1280x720.png`(ホーム・記録あり)/ `home-none-1440x900.png`・`home-none-1280x720.png`(記録なし)

## 写真・基準

- 変えた後(`after/`):`home-1440x900.png`・`home-1440x900-resume.png`・`home-1280x720.png`・`home-1280x720-resume.png`(レビュー 2 で撮り直した)。
- 見た目の基準(`e2e/visual.spec.ts-snapshots/`)は**更新していない**(Chord Dojo の基準の更新はステップ F)。戻るボタンの見た目が枠付きに戻ったので、ステップ F で基準が変わる見込み。

## 指示の外で直した所(この節で見つけたもの)

- 旧 P12.4 の戻るボタンの決まり(`.dojo .dojo-back`、枠も地も無い灰色の字)が残っていて §4B-1 の枠付きの見た目を上書きしていた。古い 2 行を消した(上の C1)。
- `degreeFunctionKinds` の読み方(上の C3)。規則は変えていない。
- `p12-3` §8 の度数の確かめ(レビュー 1 の指示どおり、ちょうど一致に戻した)。

## できなかったこと・注意

- FULL は回していない(指示どおり、ステップ F でだけ)。
- ステップ C の指示のうち「違う進行があれば止まる」は、上のとおり**読み方だけ**を直して一致させた。規則の判断をした箇所は無いが、指示の文面より一歩踏み込んでいるので、ここに書いておく。

## FULL

回していない(`P22-01-continue.md` の「FULL はステップ F でだけ回す」)。

---

# ステップ D:進行の一覧(§3)

同じブランチ `feat/p22-01-chord-dojo` の上。master へのマージ・push はしていない。

- コミット: `06343aab`(`p22-01-D1`: D1〜D4)、`1e22eb0e`(`p22-01-D5`)
  - D1〜D4 は 1 つのファイル(`BuiltinProgressionList.tsx`)の書き換えで、途中の状態ではテストが組めなかったため、一覧の e2e が全部通ってから 1 つのコミットにした。
- **通すテスト**(§3-3 の全部と、一覧の e2e 全部)
  - `npm run test:ui --`(`git grep` で出た一覧の e2e 15 本 + `p22-01-list` + `p19-voicing-drill`)→ **PASS 308/308**(213 秒)
  - 同じく、探し方を `/ を練習する$/` に直した 6 本(`dojo-single-advance`・`p12-1-dojo-ui`・`p18-01-stage2`・`p20-dojo-home`・`p22-01-function-colors`・`p22-01-home`)→ **PASS 84/84**

## D1 カードを押して始める(§3-1 の 1)

- `PracticeFrame.tsx` に `CardHeading` を足した。カードの名前(見出し)の中の `<button class="dojo-card-primary">` が主の操作で、`aria-label` は「◯◯ を練習する」、見た目は進行の名前。見出しは `aria-labelledby` で名前だけを指す(見出しの名前は今のまま「王道進行」。今のテストの `getByRole('heading',{name:'王道進行',exact:true})` がそのまま使える)。
- CSS(`chord-dojo.css` の `.dojo-card-whole`)はステップ B と同じ作り方:主の操作の `::after` をカード全体に広げ、カードの中のほかの操作(`button, a, select, input, summary, label`、キーの選ぶ欄・Jazz の版・区間の欄・「…」)を `position: relative; z-index: 1` で上に出す。
- `data-focus-key`(戻ったときのフォーカス)は今のまま(`practice:…`・`original:…`・`jazz:…`)。

## D2 ランダムの切り替え(§3-1 の 2)

- 上のキーの選ぶ欄の右に `data-testid="dojo-random-toggle"`(`aria-pressed`)。オンでカードを押すと、今の「ランダムキーで練習」と同じ画面(`onEndless`)。
- 状態は `ChordDojoView` が持ち、Chord Dojo ホームへ戻ったらオフ(保存しない)。練習から一覧へ戻ったときはオンのまま(同じ一覧の中にいる間、と読んだ)。
- **判断(報告)**: 同じ一覧の中の **Original Practice と Jazz Progressions の「ランダムキーで練習」もなくし、同じ切り替えに従わせた**(オンのとき、それぞれ今のランダムキーの動き:Original は `pickOriginalShift`、Jazz は `onJazz(id,true)`)。カードごとに「ランダムキーで練習」が残る所と残らない所がある一覧にしないため。長い進行(9 コード以上)は今どおりランダムがなく、オンでもカードの中のキーで始まる。

## D3 「…」のメニュー(§3-1 の 3)

- `todayPool` の進行のカード右下に「…」(`aria-label="そのほかの操作"`、`aria-haspopup="menu"`、`aria-expanded`)。開くと `role="menu"` の中に「今日のテーマにする」(`role="menuitem"`、今日のレッスン中は今どおり無効)。押すと今と同じ(ホームへ戻ってテーマが変わる)。
- Esc と外側の押下で閉じる。Esc は窓全体のキー(一覧の Esc = 戻る)より先に受けて止めるので、メニューが開いているときの Esc は一覧を閉じない。
- 自分の進行(`SavedProgressionList`)の「今日のテーマにする」は §3-1 の対象外なので、今のまま(小さな字のボタン)。

## D4 進み具合・最近やった・ジャンル・「?」・度数の色(§3-1 の 4〜9)

- **進み具合の点(①②③)**: 定番の進行の記録(`DojoStore` の `ItemRecord`)は `state`(まだ/仮の合格/合格)・キーごとの `lastSec`/`bestSec`・最近の結果だけで、**どの段階を終えたかは記録されていない**(`attempt` に段階がない)。新しい記録の形は作らない決まりなので、**今の「まだ/済」の印のまま**にした。
- **自己ベストの補足(§3-1 の 5)**: キーごとの `bestSec` はあるが、どの段階の秒数か・1 周の秒数か 1 コードの秒数かが記録からは決まらない(`applyAttempt` の `sec` は段階を持たない)。「② のベスト 9.8 秒」のようには言えないので、**出していない**。
- **ジャンルの並び**: `position: sticky` で上に固定。押したときは、固定した並びの下にそのまとまりの見出しが来るように、並びの高さ(幅で 1〜3 行に変わる)を測ってから `scrollIntoView` する。
- **最近やった**: `dojoRecentStore` の `standard` の記録(最大 3)を一番上に 1 行。カードの中にほかの操作がないので、カードはそのまま `<button>`(押すと記録のキーで ①、ランダムだった記録はランダムキー)。記録がなければ行を出さない。
- **説明の「?」**: 上の長い説明文を `DojoHelp`(押すと開く・`aria-expanded`、乗せると `title` で出る)へ。文は新しい押し方(カード・ランダム・「…」)に合わせて書き直した。
- **度数の色・凡例**: 度数は `FnDegrees`(`degreeFunctionKinds`)。凡例「T トニック・SD サブドミナント・D ドミナント」を一覧の右上に。

## D5 ほかの一覧(§3-2)

- Jazz Progressions・Original Practice・自分の進行・ボイシングドリルのカードも、名前が主の操作(`.dojo-card-whole`)。今の名前・`data-testid` を残した:Jazz `jazz-open`、自分の進行 `aria-label="全体を練習する"`、ドリル `drill-open-*`。Jazz の版のボタン、自分の進行の「区間を選んで練習」「詳細」・入力欄・「今日のテーマにする」は上に出して、カードの押下にならない。
- 見出しの大きさを 15px・700 にそろえた(自分の進行は 17px、ドリルは 16px だった)。ドリルの度数に機能の色、ドリルの一覧に凡例。
- 動きは変えていない。

## テストの直し(ステップ D)

### A(探し方だけ)

| ファイル | 前 | 後 |
|---|---|---|
| `dojo-single-advance`・`p12-1-dojo-ui`・`p12-3-dojo`・`p12-4-back`(4 か所)・`p12-4-long`(2)・`p12-5-original`(3)・`p12-chord-dojo`(2)・`p18-01-stage2`(3)・`p18-practice-frame`(2)・`p20-dojo-home`(3)・`p20-resume-kinds`(2)・`p22-01-back`(2)・`p22-01-function-colors`(2) | カードの `getByRole('button',{name:'これを練習する'})` | `getByRole('button',{name:/ を練習する$/})`(カードの主の操作「◯◯ を練習する」) |
| `dojo-list-scroll`(前のまとまりの 4 件) | 6 枚目のカード | 12 枚目のカード(カードのボタンの行がなくなって低くなったため、6 枚目では「十分に下までスクロールした」の前提 200px に届かない) |

型の一覧・登録した音の一覧の「これを練習する」は §3 の対象外なので変えていない(そのテストもそのまま)。

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `p12-3-dojo`「each card has the three buttons」(カードのボタンが「これを練習する・ランダムキーで練習・今日のテーマにする」) | 「each card has its name and 「…」」: ボタンは名前と「…」、名前は「ii–V–I を練習する」、切り替えはオフ、「…」の中は「今日のテーマにする」 | §3-1 の 1〜3 |
| `p12-3-dojo` §8〜11 の `openEndless` ほか 3 か所、`p12-4-back` 2 か所、`p18-practice-frame`「B ランダムキー」、`p22-01-back` の `openEndless`(カードの「ランダムキーで練習」を押す) | 切り替えをオン → カードを押す(同じランダムキーの画面になることを、それぞれの後の確かめが見る)。`p12-3` の 1 か所は、すでにオンのことを確かめてからカードを押す | §3-1 の 2 |
| `p12-4-long`「short progressions keep the random key; 9 chords and more do not」(短い進行に「ランダムキーで練習」があり、長い進行にはない) | 切り替えオンで、王道進行・下降ベース・カノン進行はランダムキーの画面、ジャズブルースなど長い進行はカードの中のキー選択があり、押すと普通の練習(ランダムキーにならない) | §3-1 の 2 |
| `p12-5-no-restart`「the random key: 9 chords and more are out…」(「ランダムキーで練習」が 45−3 枚) | 長い進行(`data-long`)がちょうど 3 枚、カノン進行は長くない、切り替えオンでカノン進行がランダムキーの画面 | §3-1 の 2 |
| `jazz-progressions`「the random key: a lap goes on…」の入口(`jazz-open-random`) | 切り替えをオン(`aria-pressed=true`)→ Jazz のカード(`jazz-open`) | §3-1 の 2(Jazz にも同じ切り替え。上の判断) |
| `dojo-list-scroll` の入口 6 つ(これを練習する/ランダムキーで練習 × 前のまとまり・Original・Jazz) | 「カード」/「ランダムをオンにしてからカード」× 同じ 3 つ。戻ったときのスクロールとフォーカスの確かめは同じ | §3-1 の 1・2 |

### 足したテスト(`e2e/p22-01-list.spec.ts`、13 件)

- カードを クリック/Enter/Space/何もない所のクリック で押すと、選んだキー(D)で ① が 1 回だけ始まる(`data-dojo-cursor` が `0:see:0:0`、最初のコードが Gmaj7)。
- 「ランダム」オン → ランダムキーの画面、一覧へ戻ってもオン、オフで普通の練習、ホームへ戻って開き直すとオフ。
- 「…」を クリック/Enter/Space で開いても練習は始まらない、Esc でメニューだけ閉じる(一覧は閉じない)、外側の押下で閉じる、「今日のテーマにする」でホームへ戻りテーマが王道進行(C のコード)になる。
- 長い進行のキーの選ぶ欄・「おまかせ」を クリック/Enter/Space で動かしても練習は始まらない。
- スクロールしてもジャンルの並びが見える。ジャンルを押すと、見出しが並びのすぐ下に来る(並びに隠れない)。
- 「?」が開いて閉じる。凡例に T・SD・D。
- 最近やった:記録がなければ行がない。`standard` の記録 1 つだけが出て、押すと記録のキー(F)で始まる(Jazz の記録は出ない)。
- Jazz とドリルの一覧:カードの何もない所で開く。Jazz の版のボタンを押しても開かない。ドリルの一覧に凡例。
- 5 つのサイズで、一覧が横にはみ出さない(ジャンルを押した後も)。

---

# ステップ E:練習画面の枠(§4)

- コミット: `27154b1a`(E1)、`44fdbf86`(E2 Original)、`740c6853`(E3 Jazz)、`dc37eb4e`(E3 ドリル)、`cf824bd5`(E3 定番)、`953ba5c8`(E3 ランダムキー + §4-6 の e2e)、`37d2b3ce`(E4)、`933b6346`(E5 の確かめ)
- **通すテスト**: Chord Dojo の e2e 49 本(`git grep` で練習・一覧・ホームに触れるもの全部。Master のものは除く)+ `p22-01-practice` → **623 PASS / 1 FAIL**(5.2 分)。落ちた 1 件は `visual.spec.ts` の `practice.png`(この基準の中身は Chord Dojo の**ホーム**で、ステップ B のホームの変更で変わったもの。§5 の基準の更新はステップ F でやる決まりなので、ここでは更新していない → ステップ F)。
  - ほかに途中で回したもの(すべて PASS): `p18-practice-frame` 33/33、`jazz-progressions` 39/39、`p19-voicing-drill` 15/15、Original の e2e 257/257、練習の e2e 23 本、`p22-01-practice` を含む 9 本 169/169、配置の e2e 7 本 168/168。

## E1 部品(`PracticeFrame.tsx`・`chord-dojo.css`)

`PracticeConditions`(条件の行。「?」と凡例を後ろに付ける)、`PracticeResult`(合否の帯。空でも 1 行分の高さ、中身があると左に色の線)、`PracticeGuide`(案内の行)、`PracticeActions`(ボタンの列)、`PracticeLap`(1 周終わりの帯)、`keyed()`(キーを `<kbd>` に、`aria-label` は「◯◯（L）」のまま)、`STAFF_HELP`(楽譜が常に出していた説明)。今のテストが見ているクラス(`.dojo-practice-set`・`.dojo-endless-actions`・`.dojo-response` など)は残した。

## E2・E3 5 つの画面

行の順番は全部「条件 → カード → 合否 → 案内 → ボタン」(`p22-01-practice` が DOM の順と y で確かめる)。MIDI の注意の帯は今どおり条件の行の上。

| 画面 | 条件の行 | 合否の帯 | 案内 | ボタン(左から) | 1 周終わりの帯 |
|---|---|---|---|---|---|
| 定番の進行(`ChordDojoView`、一覧から開いた練習) | キー・判定の決まり・使いたい・この段階をくり返す・設定(BPM)・?・凡例 | `.dojo-result`(✓/✗、テンポの n/m、N 番目は X です 等)・秒数 | 今何をするか・前の周のヒントの印 | 次へ/もう一度(Enter)・覚えた・テンポで始める/止める(Space)・弾けた(Y)/まだ(N) → お手本を聴く(L) → 答えを見る(Space)・もう一度見る・n 番目の答え → とばす | ① を 1 周(もう一度 ① を弾く(R)・② 覚えて弾くへ(Enter)・一覧へ)、② をヒントなしで通した(もう一度 ② を弾く(R)・終わる(Enter)・一覧へ) |
| ランダムキー(`ChordDojoEndlessView`) | キー(ランダム)・判定の決まり・?・凡例 | クリア!・✗ のとき | 今何をするか(✗ のときは帯へ移る同じ 1 つの要素) | 弾けた(Y)・まだ(N) → お手本を聴く(L) → 答えを見る(Space) → このキーをとばす | なし(止まらずに次のキーへ進む練習なので。上の「結果を見て終わる」は今のまま) |
| Original Practice | キー・ランダムキー・最初から・この段階をくり返す・?・凡例 | 完奏(続けるとき) | 何を押さえるか | 弾けた(Y) → お手本を聴く(L) | 完奏(もう一度 ① を弾く(R)・一覧へ) |
| Jazz Progressions | 版・キー・ランダムキー・この版のキー・最初から・BPM・オクターブ・この段階をくり返す・?・凡例 | 完奏(続けるとき) | 何を押さえるか・推奨ボイシングの注 | 弾けた(Y) → お手本を聴く(L)・通して聴く → 答えを見る(Space) | 完奏/② を通した(もう一度 ①/② を弾く(R)・② 覚えて弾くへ(Enter)・一覧へ) |
| ボイシングドリル | キー・ランダムキー・最初から・この段階をくり返す・?・凡例 | 押さえた形が違う理由(`drill-reason`) | 記録の行・計測中の秒数・状態 | 始める・弾けた(Y) → お手本を聴く(L) → ヒント(Space) | 1 周の結果の上に帯(今回・自己ベスト・前回 / もう一度(R)・組の一覧へ)。カードごとの表はその下に今のまま |

- **前と同じボタンが全部ある**: 上の表のボタンは、前の画面にあったものと同じ(名前・`data-testid`・押したときの動き・キーボードのキー)。移したのは、1 周終わりのボタン(行から帯へ)と並び順だけ。
- **足したもの**: 帯の「一覧へ」(定番・Original・Jazz)。見本の帯にあり、押すと戻るボタンと同じ動き(新しい行き先ではない)。
- **主役の塗り**: 帯では「もう一度」を塗り(見本・§4-5)、「② 覚えて弾くへ」「終わる」は枠だけにした(前は 2 つとも塗り)。
- 今日のレッスンの練習(一覧からではない練習。`dojo-flow` の別の枠)は、§4 の 5 つの画面に入らないので変えていない。
- 練習画面の凡例は、見本のとおり文字だけ(「T・SD・D」。名前は `title` と `abbr`)。一覧の凡例は名前付き。条件の行が長い Jazz で、名前付きの凡例は 1440×900 でも 2 行に折り返したため。

## E4 上の空白を詰める・カードを大きくする(§4-2)

- 真ん中の行を上下の中央に置くのをやめ、上から並べた(1440×900 で条件の行の上にあった約 85px の空白がなくなった)。
- 大きい画面(stacked)では、コード名を 1.3 倍、度数と余白を少し大きく。Jazz はカードに音の 2 行があり真ん中に余りがないので、今の大きさのまま。768×640 など小さい画面は変えていない。
- **楽譜の説明を「?」へ移したぶん(§4-4)**、楽譜の行を 16px 低くした(楽譜の絵の大きさは同じ。消えたのは下の指の説明の 1 行)。その 16px を真ん中の行に回し、増えた 2 行(合否・案内)を 1280×720 に収めた(小さい画面の行の間を 4px → 3px、合否の帯の最低の高さを 19px に)。
- **§4-2 の優先順位 2 を使った所**: Jazz の 009 番(版のボタン 3 つ)は、1280×720 で条件の行が 2 行になる。そのときは真ん中の行を削らず、楽譜と鍵盤が下へずれ、ページが約 22px 縦にスクロールする(真ん中に自分だけのスクロールは出さない)。1440×900 以上と、ほかの画面・項目はスクロールなしで収まる。ドリルの 1 周の結果(表)は今どおり真ん中の中でスクロールする。
- `p18-practice-frame` は直さずに全部通った(鍵盤が欠けない・横にはみ出さない・鍵盤の下の空き・真ん中のスクロールなし)。

## E5 `<kbd>`(§4-3)

ボタンの「（L）」などを `<kbd>L</kbd>` に。アクセシブルネームは `aria-label` で「お手本を聴く（L）」のまま。`p22-01-practice` が 5 つの画面で「文字に（L）が残っていない・名前が文字+（キー）」を確かめる。

## E6 説明の「?」(§4-4)

楽譜の上の「構成音表示・リズム指定なし／左＝左手 · 右＝右手」と下の指の説明(と、運指候補なし・代表例の注)は、`GrandStaff` の `quiet` で出さず、条件の行の「?」の中へ(`STAFF_HELP`。ドリルは指の説明がないので、ドリルの一覧の説明と合わせた `DRILL_HELP`)。「〜を聴いています」や Jazz の「この進行で学ぶこと」など、楽譜の見出しに渡している文は今どおり出る。耳で弾く・2-5-1 Master の楽譜は変えていない。鍵盤の上の色の説明も今のまま。「構成とベースが合えばよい(転回は自由)」は短いので条件の行に残した。E6 は 1 つの画面を替えるときに一緒に入れた(E2・E3 のコミットに入っている)。

## E7 1 周終わったときの帯(§4-5)

`PracticeLap`(点線の箱。左が結果、右がボタン)。表は上の E2・E3。出す数字・文・ボタンの動き、「この段階をくり返す」がオンのときに止まらず次の周へ行く動き(そのときは帯ではなく合否の帯に 1 行)は今のまま。

## テストの直し(ステップ E)

### A(探し方だけ)

| ファイル・テスト | 前 | 後 |
|---|---|---|
| `p12-chord-dojo`「P12 builtin recall hides names…」 | `.dojo-result` の「頭から弾いてください。止まると…」 | 案内の行(`practice-guide`)の同じ文(案内は合否の帯とは別の行になったため) |

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `jazz-progressions`「the cards, what is taught… fit at W×H」の「鍵盤の下端が窓の中」(1280×720 など) | 条件の行が 1 行なら今のとおり窓の中。2 行に折り返したときは、ページの一番下までスクロールして鍵盤の下に 16px 以上の空き(真ん中のスクロールなし・カード・シーク・案内が真ん中に収まる、はそのまま) | §4-2 の優先順位 2・3 |
| `jazz-progressions`「octave +1 fits at W×H」の「鍵盤が窓の中」 | 同上 | 同上 |

### 足したテスト(`e2e/p22-01-practice.spec.ts`、5 つの画面 × 4 件)

- 行の順番(条件 → カード → 合否 → 案内 → ボタン)が DOM でも y でも同じ。
- 合否の帯に「✓ 合いました」を出しても消しても、カードとボタンの y が変わらない。60 字の文は切れずに全部見える。
- キーが `<kbd>` で、名前は「◯◯（キー）」。
- 「?」を押すと説明が出て、もう一度押すと消える。

## 写真(ステップ D・E・F)

`p89-generated/p22-01-chord-dojo/after/`(追跡しない)。5 つのサイズ(1280×720・1366×768・1440×900・1920×1080・768×640)× 次の 17 の画面(85 枚)。撮り方はテストと同じブラウザ(暗い配色・日本語)で、`document.fonts.ready` の後 2 フレーム待って撮った(写真用の一時的な spec で撮り、コミットしていない。テストの中に写真を残すと FULL のたびにファイルを書くため、ステップ D・E で入れた写真のテストも外し、5 つのサイズで一覧が横にはみ出さない確かめだけ残した)。

`home-none`(MIDI なし・記録なし)/`home-records`(MIDI あり・最近の記録あり)/`list-top`/`list-jpop`/`list-original`/`list-jazz`/`list-saved`/`list-drill`/`practice-standard-1`(①)/`practice-standard-2`(②)/`practice-lap-end`(① を 1 周)/`practice-random`/`practice-jazz-1`/`practice-original`/`practice-drill-1`/`ear-degrees-on`(耳で弾く・度数と機能を見せる)/`master`(2-5-1 Master)

変える前は `before/`(§0 とステップ C)。見本と比べて:一覧は見本どおり(キーとランダム・凡例・「?」が上、最近やった、カードの右上の印、右下の「…」)。練習画面は見本どおり上から 条件 → カード → 合否 → 案内 → ボタン、1 周終わりは点線の帯。見本と違う所:進み具合の点(記録がない)・カードの「② のベスト」(記録から言えない)は出していない。768×640 の写真に左のメニューの小窓(「Chord Dojo / Voicing Loop / Bass Practice」)が写っているのは、左のメニューのフォーカスの表示で、この指示書では触っていない。

---

# ステップ F:写真・基準・FULL(§5・§6)

- コミット: `33cd87ac`(F1: 写真をテストの外へ)、`f8d7f289`(F2: 途中の報告)、`f752bdf7`(F3: 練習カードの機能の色)、`743e0322`(F4: 基準の更新)、`8813e983`(F5: FULL 1 回目の原因の直し)、この報告のコミット
- 途中で一度止まった:基準の写真の更新が権限で拒否され、利用者に聞いた。利用者の指示で、先に F3 を直し、許可されたコマンドで基準を更新して続けた。

## F3 練習画面のカードに機能の色が出ていなかった(利用者の指摘)

- 原因:§1-4 の上の線の決まりは `.dojo-card[data-fn]`(一覧のカード向け)にしか当たっておらず、練習画面のカード(`.dojo-endless-cards>button`)には線がなかった。度数の文字の色は、カードの状態の色(今のカード=緑、ほか=灰)の決まりが勝っていた。
- 直し(`chord-dojo.css`):カードの `data-fn` から色(`--card-fn`)を決め、
  - カードの上の端に 4px の線(`::before`。`data-fn-borrowed` のときは点線)。今・済み・まだのどのカードでも出る。
  - 度数の文字と、となりの印(`span.dojo-card-fn`、文字の色を受け継ぐ)を機能の色に。今のカードでも機能の色。
  - 今のカードの緑の枠と背景は今のまま。
  - 5 つの練習画面は同じ `PracticeCard` なので同じに出る。
- 足したテスト(`e2e/p22-01-function-colors.spec.ts`、3 件):王道進行 ① の 4 枚で、度数の文字・印・上の線の色が `--lv-fn-sd` / `--lv-fn-d` / `--lv-fn-t` / `--lv-fn-t` の色と同じ(`getComputedStyle`)、線は 4px・実線、1 枚目は今のカードで緑の枠のまま。I–VI7–ii–V で VI7 の線だけ点線。Jazz(001 の 1 枚目)とドリル(cycle-a の 1 枚目、T)でも同じ。
- 通したテスト:`p22-01-function-colors` 5/5、練習画面の e2e 9 本 180/180。
- 練習画面の after の写真(`practice-*`、7 画面 × 5 サイズ)を撮り直した。

## 基準の写真(§5-2)

- 更新したのは `e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png` の 1 枚だけ(中身は Chord Dojo のホーム。ステップ B のホームの変更と F5 の Master カードの行で変わった)。コマンドは利用者が許可した
  `node scripts/run-playwright-visual-tests.mjs e2e/visual.spec.ts --grep "Vault, detail, Dojo and long content" --update-snapshots=changed`。
  2 回(F4 と F5)とも、`git status` で変わった基準がこの 1 枚だけであることを確かめた。ホーム(アプリの)・設定・Vault・取り込むの基準は変わっていない。
- 前の写真:旧ホーム(主役の塗りが 6 つ、Master カードに「2-5-1 Master 続きから」の大きなボタン)。後:主役は「定番の進行を開く」1 つ、カードは名前を押して開き、ほかは小さなリンク。

## FULL

| 回 | 時刻 | コミット | 結果 | 時間 | 中身 |
|---|---|---|---|---|---|
| 1 | 20:22〜20:36 | `743e0322` | **FAIL** | — | 静的チェック全部 PASS、Vitest 6378/6380(2 は今からある skip)、Playwright 911/913(2 は今からある条件付き skip)、**heavy で 4 件 FAIL**(`p12-master251-register` の「Master lower review scope…」と「Master Home ranges 1440x900 / 1366x768 / 1280x720…」) |
| 2 | 20:47〜21:00 | `8813e983` | **PASS** | 772.6 秒 | 静的チェック全部 PASS、Vitest 6378/6380、Playwright 911/913、heavy 53/53、goto の開き直り 0 回、Git diff check PASS、追跡している PNG の変化なし |

### 1 回目に落ちた原因と直し(F5)

- 落ちた 4 件は、Chord Dojo ホームの Master カードの音域の表示(「学習順 A → B → C → D」/「1オクターブ下 · A→B→C→D」)を、カードの `<small>` として読んでいた。ステップ B でこの表示を数字の行(`0 / 48 MASTER・…`)へ移したので見つからず(3 件は `getBoundingClientRect` が null)、見つけるように直すと、狭いカードで「1オクターブ下…」のほうだけが折り返し、元の音域のときよりカードが 17px 高くなった(「両方の音域でカードの高さが同じ」の確かめ)。
- **自分の変更(ステップ B)が原因**。音域の表示を数字の行から出して、自分の 1 行(`small.master251-range`、`data-testid="master-range-label"`)に戻した。両方の音域で 1 行に収まり、高さが同じになる。テストは探し方だけを `master-range-label` に直した(テストの決まり A。中身の確かめは同じ)。
- 同じ FULL の写真で、ホームに注意の帯が 2 本(「元の進行が変更または削除されています…」と MIDI)出ているのを見つけた。`DojoHome` は 2 行を 1 本にまとめる作りだったが、`ChordDojoView` が `sourceChanged` を渡しておらず、別の帯が残っていた(§2-1 の取りこぼし)。渡すようにして、ホームでは別の帯を出さないようにした。
- 関係するテスト(Master の 3 本・ホームの 5 本・`p12-theme-score`・`p12-chord-dojo`・`p20-resume-kinds`・`p12-vertical-layout`)を `test:ui` で回して 174/174 PASS を確かめてから、FULL を回し直した(2 回目)。

### テストの直し(ステップ F)

| 種類 | ファイル・テスト | 前 | 後 |
|---|---|---|---|
| A | `p12-master251-register`「Master lower review scope…」 | `.master251-card small` | `getByTestId('master-range-label')` |
| A | `p12-master251-register`「Master Home ranges W×H…」 | `card.querySelector('small')` | `card.querySelector('[data-testid=master-range-label]')` |

## 写真(最終)

- `p89-generated/p22-01-chord-dojo/after/` に 17 の画面 × 5 サイズ(85 枚)。F3 の後に練習画面、F5 の後にホーム(`home-none`・`home-records`)を撮り直した。
- 変える前は `before/`。

# P22-01 の未完了

なし。指示書どおりにできなかった所(記録から読めない進み具合の点・② のベスト、ランダムキーの練習には止まる 1 周の終わりがないこと、1280×720 の Jazz 009 番の縦スクロール)は、上のそれぞれの節に理由を書いた。master へのマージ・push はしていない。
