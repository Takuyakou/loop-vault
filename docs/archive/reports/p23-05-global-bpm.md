# P23-05 共通 BPM(上の帯の部品と、値を残す所)の報告

指示書:`P23-05-global-bpm.md`(受け渡し:`inbox/P23-05/`)。master へのマージと push はしていない。

## ブランチとコミット

ブランチ `feat/p23-05-global-bpm`(master `e53cc3df` から)。作業の場所は `<作業フォルダ>/Loop Vault-p23`。

| コミット | 内容 |
|---|---|
| `62c83265` | p23-05-01: where the global BPM is kept |
| `f6879be9` | p23-05-02: GlobalBpmProvider |
| `e1e0c72f` | p23-05-03: GlobalBpmField |
| `d4708a41` | p23-05-04: the BPM field in the header |
| `6e8c1fa1` | p23-05-04b: below 900px the Home date gives its room to the title(質問 1 の答え。G3) |
| `66498cb0` | p23-05-06: gallery sample(「§5 より前にやってもよい」のとおり先に) |
| `d461607a` | p23-05-03b: the value is not aria-expanded; the open list is marked by data-open(質問 2 の答え) |
| `c1692582` | p23-05-05: e2e and baselines |
| `06043939` | p23-05-05b: the header order test includes the BPM field(FULL 1 回目で見つけた物) |
| (この報告) | p23-05-07: report |

## 止まって聞いたこと(2 回)

受け渡しの場所に QUESTION を書き、ANSWER を待ってから続けた。

1. **§4 の確かめ 1・2**:80 通りのうち 1 通りが収まらなかった。ホーム・768×640・左メニューを開いた形で、題「ホーム」が「ホ…」に切れた(題 35px。切らずに出すには 55px、4.5 文字分なら 81px)。答えは案 1 で、**G3 幅 899px 以下ではホームの題の横の日付を出さない**を足すことになった。`src/styles/shell.css` の最後に `@media (max-width: 899px) { .lv-app-header-subtitle { display: none; } }` を足した。測り直すと、この形で題は 55px で切れていない。日付は 1280×720 以上で今までどおり出る(e2e で確かめた)。
2. **§3-1 の形と §5 の 8(axe)が合わない**:`role="spinbutton"` に `aria-expanded` は使えず、一覧を開くと axe が critical 1 件(`aria-allowed-attr`)を出した。答えは案 1。値の所から `aria-expanded` を外し(`aria-haspopup="dialog"` は残す)、開いている印は `data-open="true"` にした。CSS も `[data-open="true"]` に替えた(見た目は同じ)。axe の確かめはゆるめていない。

## 節ごとに変えたこと

- §0:前の写真(下の「写真」)。
- §1 `src/audio/globalBpmPreference.ts`(新規)と `globalBpmPreference.test.ts`(6 件:何も無い 120/96/10→30/999→240/100.6→101/"abc"・壊れた JSON・version 2 → 120/`saveGlobalBpm(300)` → 240/`getItem`・`setItem` の例外で落ちない)。
- §2 `src/components/GlobalBpmProvider.tsx`(新規)と `GlobalBpmProvider.test.tsx`(6 件)。`src/App.tsx` の `<MetronomeProvider>` のすぐ内側に `<GlobalBpmProvider>`。知らせ(`announceSongBpm`)は並べて持ち、後のものを使う。取り消すと残りの最後に戻る。Provider の外では 120 から始まり、残さない。
- §3 `src/components/GlobalBpmField.tsx`(新規)と `GlobalBpmField.test.tsx`(17 件。3-2 の表の全部の行と 3-4 の追加分)。`src/styles/shell.css` に指示書の CSS(`.lv-volume-group` の前。`.lv-global-metronome` の決まりは無かった)と、`@media (max-width: 1299px)` の中の 2 つの決まり。矢印は Lucide の `ChevronsUpDown`(16px)。
- §4 `src/components/AppShell.tsx`:`<GlobalMetronomeButton />` のすぐ前に `<GlobalBpmField />`。G3 は上の 1。
- §5 `e2e/p23-05-global-bpm.spec.ts`(新規、8 本。下)。テストの直し・基準の写真(下)。加えて `src/styles/shell.css` の `.lv-volume-group .lv-level-meter` に `position: relative` を足した(下の「§5 で見つけて直した物」)。
- §6 `src/components/ui/ComponentGallery.tsx` に `Section title="P23-05 共通 BPM"`(`data-testid="p89-gallery-p23-05"`。`GlobalBpmProvider` で包んだ `GlobalBpmField` と、`useAnnounceSongBpm(100)` を呼ぶ小さい部品)。

## §4 の確かめ 1〜3

5 つのサイズ × 左メニュー 2 つの形 × 8 つの画面 = 80 通りを、G3 を入れたあとに測った(表は下)。

1. **上の帯の高さ**:80 通りとも 56px。**上の帯の横のはみ出し**:0。**部品どうしの重なり**:0。BPM の値の箱はメトロノームの 8px 左。**題の幅**:4.5 文字分(81px)以上。ただし次の 2 つは別。
   - ホームは日付がある形で、題の最小幅の決まりが元から外れている。題は 55px で、master と同じ。切れていない。
   - 進行のページ(題がとても長い)は「…」で切れるが、幅は 138〜961px ある。
2. 収まらない組み合わせは、G3 のあとは無い。
3. **一覧(popover)**:5 つのサイズ × 2 つの形で、右端は窓の中、下端は 231px で、窓からはみ出さない。768×640 では左 322〜右 612。

上の帯の右の部品の合計の幅は、1299px 以下(1280×720・768×640)で 338px(master 285px、+53px)、1366px 以上で 525px(master 422px、+103px)。

Voicing Loop の 768×640・左メニューを開いた形では、ページ全体が 112px 横にはみ出す(上の帯ははみ出していない)。master でも同じなので、この指示書の変更によるものではない(質問 1 の答えのとおり、気づいたことに書くだけ)。

<details><summary>80 通りの表(G3 のあと。「ページのはみ出し」は document 全体)</summary>

| 画面 | サイズ | 左メニュー | 高さ | ページのはみ出し | 部品の重なり | 右の部品の幅(master) | 題の幅(4.5 文字分 81px) |
|---|---|---|---|---|---|---|---|
| home | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 55 |
| home | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 55 |
| home | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 55 |
| home | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 55 |
| home | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 55 |
| home | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 55 |
| home | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 55 |
| home | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 55 |
| home | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 55 |
| home | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 55 |
| vault | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| vault | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 81 |
| vault | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| vault | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| vault | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 81 |
| capture | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| capture | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 81 |
| capture | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| capture | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| capture | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 81 |
| progression-page | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 650(…で切れる) |
| progression-page | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 818(…で切れる) |
| progression-page | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 549(…で切れる) |
| progression-page | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 717(…で切れる) |
| progression-page | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 623(…で切れる) |
| progression-page | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 791(…で切れる) |
| progression-page | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 961 |
| progression-page | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 961 |
| progression-page | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 138(…で切れる) |
| progression-page | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 306(…で切れる) |
| voicing-loop | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 119 |
| voicing-loop | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 119 |
| voicing-loop | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 119 |
| voicing-loop | 768x640 | 開 | 56 | 112 | 0 | 338(285) | 119 |
| voicing-loop | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 119 |
| chord-dojo | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 102 |
| chord-dojo | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 102 |
| chord-dojo | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 102 |
| chord-dojo | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 102 |
| chord-dojo | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 102 |
| bass-practice | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 125 |
| bass-practice | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 125 |
| bass-practice | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 125 |
| bass-practice | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 125 |
| bass-practice | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 125 |
| settings | 1280x720 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| settings | 1280x720 | 畳 | 56 | 0 | 0 | 338(285) | 81 |
| settings | 1366x768 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 1366x768 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 1440x900 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 1440x900 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 1920x1080 | 開 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 1920x1080 | 畳 | 56 | 0 | 0 | 525(422) | 81 |
| settings | 768x640 | 開 | 56 | 0 | 0 | 338(285) | 81 |
| settings | 768x640 | 畳 | 56 | 0 | 0 | 338(285) | 81 |

</details>

## §5 の e2e(`e2e/p23-05-global-bpm.spec.ts`)

1. G1:ホーム・Vault・取り込む・Voicing Loop(練習の画面)・Chord Dojo・Bass Practice・設定の 7 つで、値の所が見え、メトロノームのすぐ左(箱の x と、上の帯の右の並びの順番)。
2. ホイール上 3 回で 123、Shift+ホイール下 1 回で 118。ページはスクロールしない。
3. 押して離すと一覧が出る。「80」で 80 になって閉じ、カーソルは値の所に戻る。「+5」で 85、一覧は開いたまま。Esc で閉じる。
4. ダブルクリックで `97` を打って Enter → 97。`abc` を打って Enter → 97 のまま。
5. 85 にして読み込み直しても 85。Vault へ移っても 85。
6. **つながっていないこと**:テキスト取り込みの BPM の欄(`text-progression-bpm`)と、Voicing Loop の練習の BPM(`voicing-loop-transport` の中の `#voicing-loop-bpm`)の値は、共通の BPM を +10(PageUp)しても変わらない。**結果:どちらも変わらなかった**(PASS)。
7. ホームと Voicing Loop で、5 つのサイズ × 2 つの形:上の帯 56px、部品が重ならない、ページが横にはみ出さない。Voicing Loop・768×640・開いた形だけは、上の帯そのもので確かめる(理由をコメントに書いた)。ホームの日付は 900px 以上で出て、899px 以下では出ない(G3)。
8. 一覧を開いたホームで axe(`e2e/accessibility.spec.ts` と同じタグ)に重大な違反が無い。

## テストの直し

### A(探し方)

| ファイル:行 | テスト | 前の探し方 | 後の探し方 |
|---|---|---|---|
| `e2e/dojo-long-hardening.spec.ts:10` | saved progression list and expanded controls are readable(6 サイズ) | `page.getByRole('spinbutton')` が 0 | `page.locator('#main-content').getByRole('spinbutton')` が 0(上の帯の BPM の値が spinbutton なので、画面の中身だけを見る) |
| `e2e/p12-3-dojo.spec.ts:137` | §7 … ii–V–I ① shows ii7 · V7 · Imaj7 | `page.getByLabel('BPM')` | `page.locator('#main-content').getByLabel('BPM')`(「共通 BPM」と 2 つ以上当たるため) |
| `e2e/p12-4-back.spec.ts:147`・`:149` | an open panel closes first; the next Esc goes back | `page.getByLabel('BPM')`(見える/0 個) | `page.locator('#main-content').getByLabel('BPM')` |
| `e2e/p18-01-stage2.spec.ts:231` | R does nothing while typing, or while a dialog is open | `page.getByLabel('BPM').focus()` | `page.locator('#main-content').getByLabel('BPM').focus()` |

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `src/components/AppShell.test.tsx:176` 上の帯の右の並びが `midi・sound・metronome・volume・save` | 並びが `midi・sound・bpm・metronome・volume・save`(BPM がメトロノームのすぐ前) | G1・§4 |

C(弱める)は 0 件。

### §5 で見つけて直した物(テストではなくアプリの CSS)

`e2e/p12-chord-dojo.spec.ts:1399`「P12 small and 200 percent practice … without horizontal page overflow」が、1366×768 を `zoom: 2` にした形で、ページの横のはみ出し 130px で落ちた。

- 原因:上の帯の右の音量のメーター(`.lv-level-meter`)の中の読み上げ用の文字(`.sr-only`、`position: absolute`)の置き場所が、メーターではなくページ全体になっていた。上の帯の右が BPM の分だけ広がり、上の帯が `overflow: hidden` で隠している外へその文字が出て、ページを広げていた。master でも、この形で上の帯の右はすでに 7px 外に出ていた(文字はページの中に収まっていた)。
- 直し方:`.lv-volume-group .lv-level-meter` に `position: relative` を足し、その文字をメーターの中に置いた。見た目は変わらない(基準の写真はこの直しの前後で同じ)。テストは直していない。

### 基準の写真

8 枚全部を作り直し、8 枚全部の前・後・差を見た。全部の写真で、変わったのは上の帯の右の所だけ(MIDI の印・ピアノ/エレピが BPM の分だけ左へ動き、BPM の部品が増えた)。

- 変わった画素は、7 枚が 3629 px。`progression-detail-default` は 4122 px で、長い題の「…」の位置が BPM の分だけ左へ動いた所を含む。どれも上の帯の中だけ。
- 前・後・差は `p89-generated/p23-05/baselines/{before,after,diff}/`。
- 更新したファイル:`e2e/visual.spec.ts-snapshots/` の `capture-analysis-results`・`capture-empty`・`capture-source-selection`・`home`・`practice`・`progression-detail-default`・`settings`・`vault`(`-chromium-desktop-win32.png`)。

## 写真

- 前:`p89-generated/p23-05/before/`(7 画面 × 1440×900・1280×720・768×640 と、`home-collapsed-1440x900`。22 枚)
- 後:`p89-generated/p23-05/after/`(同じ 22 枚と、`popover`・`editing`・`focus`・`song` の 1440×900・768×640。30 枚)
- 確かめ:`p89-generated/p23-05/checks/`(`header.tsv`・`header-master.tsv`・`home-768x640-open.png`)

目で見たのは、前の `voicing-loop-768x640`、後の `home-1440x900`・`popover-768x640`・`focus-1440x900`・`editing-1440x900`・`song-1440x900`、確かめの `home-768x640-open`、基準の写真の差の `home`・`progression-detail-default` の 9 枚。残りは目で見ておらず、§4 の数で確かめた。

「曲 100」の写真は、開発のビルドにだけ出る見本の画面で撮った(ふだんのビルドでは見本の画面は出ない)。

## FULL

- 1 回目(11 月 12 日 10:51 開始、`c1692582`):FAIL。Source contracts〜App TypeScript は PASS。Vitest full で 1 件落ちた。`src/components/AppShell.test.tsx:176`(上の帯の右の並びに BPM が入っていない古い期待)。自分の変更が原因なので B で直し(上の表)、単体で通るのを確かめて `06043939` にした。Playwright と heavy はこの回は回っていない。ログ:`.local-evaluation/test-logs/2026-11-12T01-51-37-448Z-*`。
- 2 回目(11 月 12 日 10:53 開始、`06043939`):**PASS(794.7 秒)**。Vitest full 6516/6518(2 は前からある飛ばし)、Playwright full 957/959(2 は前からある条件つきの飛ばし)、Playwright heavy 53/53、goto の開き直り 0 回、Git diff check・Tracked PNG check PASS。ログ:`.local-evaluation/test-logs/2026-11-12T01-53-41-373Z-full.log`。

## 指示書どおりにできなかった所

- §3-1 の形の `aria-expanded`:`spinbutton` には使えない(指示書の誤り)。質問 2 の答えで外し、`data-open` にした。
- §4 の確かめ 1(ホーム・768×640・左メニューを開いた形):そのままでは題が切れた。質問 1 の答えで G3 を足した。
- `.lv-global-metronome` の決まりが `shell.css` に無かったので、指示書のとおり `.lv-volume-group` の前に置いた。

## 気づいたこと(直していない)

- Voicing Loop の 768×640・左メニューを開いた形で、ページ全体が横に 112px はみ出す(master でも同じ)。
- `@media (max-width: 639px)` の決まり(上の帯の右の `role="group"` を音量以外隠す)に BPM の部品も当たるため、639px 以下では BPM の部品が出ない。5 つのサイズの外。
- 入力中(ダブルクリックのあと)は、入力の欄に全体の `:focus-visible` の水色の枠が出る(`outline: none` より全体の決まりが勝つ)。写真 `after/editing-*`。
- `zoom: 2` の形(1366×768 を 2 倍)では、メディアの決まりが効かないため上の帯の右が広いままで、上の帯の右端が少し隠れる(master でも 7px)。ページははみ出さない。
