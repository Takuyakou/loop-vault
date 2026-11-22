# P23-01 字の入れ替え・記号の字・役割の色(SD)の報告

- ブランチ:`feat/p23-01-fonts-and-colors`(master `8b8c24c9` から)
- 作業した日:2026-11-11

## ブランチとコミット

| コミット | 節 |
|---|---|
| `e373f7e4` p23-01-01: Inter + Noto Sans JP + LV Symbols replace IBM Plex Sans JP | §1 |
| `2bbe19bc` p23-01-02: drop the full-width squeeze on Ⅰ and Ⅱ | §2 |
| `9539f439` p23-01-03: SD and SDm turn yellow | §3 |
| `d3f5f77d` p23-01-04: record the font licences | §4 |
| `c68e182d` p23-01-05: tests for the new fonts and colours | §5-1・5-2 |
| `b3f50f78` p23-01-06: refresh the visual baselines | §5-5 |
| (この報告のコミット) | §7 |

## 節ごとに変えたこと

- §0:変える前の 15 画面 × 5 サイズを撮った(下の「写真」)。
- §1:`src/assets/fonts/` に字のファイルを入れ、古い字を消した。`src/styles/fonts.css` を指示書の中身に丸ごと置き換えた(IBM Plex Mono の 2 つは今の中身と同じだったので、そのまま)。`src/styles/tokens.css:2`〜`3` の 2 行。`src/styles/home.css`・`vault.css`・`live-midi.css` の 8 か所を `var(--font-mono)` に。
- §2:`src/views/ear-practice/ear-practice.css` の 4 行(コメント 2 行と `.ear-roman[data-roman="Ⅰ"]`・`[data-roman="Ⅱ"]`)を消した。`romanSpans` と `data-roman` は残した。
- §3:`src/styles/tokens.css:5`〜`6` の 2 行(`--lv-fn-sd: #f5dc4a`・`--lv-fn-sdm: #b9a03a`)。
- §4:`README.md` の「## License」の最後に 1 行、`README.en.md` の「## License」の最後に 1 行(どちらも節の最後なので、ファイルの最後に空行をはさんで足した)。
- §5:`e2e/phase8.8.5-final-ui.spec.ts` の字の確かめを書き換え、`e2e/p23-01-fonts.spec.ts`(5 件)を足した。基準の写真 8 枚を更新した。

## 1. 入れたファイルと消したファイル

| 入れた | 大きさ(バイト) |
|---|---|
| `inter-latin-400-normal.woff2`・`-600-`・`-700-` | 23664・24452・24356 |
| `inter-latin-ext-400-normal.woff2`・`-600-`・`-700-` | 35000・36260・36244 |
| `noto-sans-jp-japanese-400-normal.woff2`・`-600-`・`-700-` | 1132964・1149708・1158216 |
| `lv-symbols-400-normal.woff2`・`-600-`・`-700-` | 1040・1084・1072 |
| `OFL-Inter.txt`・`OFL-Noto-Sans-JP.txt`・`OFL-Noto-Sans-Symbols.txt` | 4477・4314・4381 |
| `SOURCE.md` | 837 |

| 消した(`git rm`) | 大きさ(バイト) |
|---|---|
| `ibm-plex-sans-jp-latin-400-normal.woff2`・`-600-` | 24424・25844 |
| `ibm-plex-sans-jp-japanese-400-normal.woff2`・`-600-` | 893784・937420 |
| `OFL-IBM-Plex-Sans-JP.txt` | 4877 |

- 残した:`ibm-plex-mono-latin-400-normal.woff2`(14708)・`-600-`(15620)・`OFL-IBM-Plex-Mono.txt`(5392)。
- ビルドしたあとの `dist/assets/` の字のファイル(`npm run test:full` の中のビルド):

| ファイル | 大きさ(バイト) |
|---|---|
| `ibm-plex-mono-latin-400-normal-DMJ8VG8y.woff2`・`-600-…-BgSNZQsw.woff2` | 14708・15620 |
| `inter-latin-400-normal-C38fXH4l.woff2`・`-600-…-LgqL8muc`・`-700-…-Yt3aPRUw` | 23664・24452・24356 |
| `inter-latin-ext-400-normal-C1nco2VV.woff2`・`-600-…-D2bJ5OIk`・`-700-…-Ca8adRJv` | 35000・36260・36244 |
| `noto-sans-jp-japanese-400-normal-C7ZJEbOP.woff2`・`-600-…-DGzj4jEH`・`-700-…-BUBp6yR1` | 1132964・1149708・1158216 |

- `lv-symbols-*.woff2` の 3 つは小さい(約 1 KB)ので、ビルドで CSS の中に埋め込まれ(`data:font/woff2;base64,…`、`dist/assets/index-KZBlgWEJ.css`)、別のファイルにはならない(Vite の決まりの動き。設定は変えていない)。

## 2. §1-5 で置き換えた行

| ファイル:行 | 前 | 後 |
|---|---|---|
| `src/styles/home.css:56`・`83`・`219`・`325` | `font-family: "IBM Plex Mono", ui-monospace, monospace;` | `font-family: var(--font-mono);` |
| `src/styles/vault.css:124`・`380` | 同じ | 同じ |
| `src/styles/live-midi.css:54`・`64` | 同じ | 同じ |

- `git grep -n '"IBM Plex Mono"' -- src ':!src/styles/fonts.css' ':!src/styles/tokens.css'`:**0 件**(終了コード 1)。
- `IBM Plex Sans JP` の名前が残っているのは、古い記録の文書(`docs/phase8.8.5/…`・`docs/phase8.9/…`・`docs/phase13.0/bass-practice-mock.html`)だけ。変えていない。

## 3. §2 でほかに見つけた「詰め」

- Ⅰ〜Ⅶ の詰め:**無し**(`git grep -n -P "roman|[\x{2160}-\x{216B}]" -- 'src/**/*.css'` は `fonts.css` のコメント 2 行だけ)。
- 参考:`src/views/chord-dojo/chord-dojo.css:511` の `.dojo-dflat::after { content: "♭♭"; …; letter-spacing: -1px; }`(ダブルフラットの 2 つの ♭ を寄せている)。Ⅰ〜Ⅶ ではないので触っていない(「気づいたこと」に書いた)。

## 4. 5-3 の直し(字の幅のせいで落ちたテスト)

- **無し**。§1〜§4 のあとに Playwright を全部回した(`npm run test:e2e`、992 件)。落ちたのは見た目の基準の写真の 4 件だけ(`e2e/visual.spec.ts` の「Home」「Capture states and correction workflow」「Vault, detail, Dojo and long content」「Settings visual baseline」。どれも `toHaveScreenshot` の違い)で、5-5 で基準を更新して直した。位置・大きさ・はみ出しを確かめるテスト(P23-00 の A8)は全部通った。
- §5-6 の途中の確かめ:`npm run test:ui -- e2e/phase8.8.5-final-ui.spec.ts e2e/p23-01-fonts.spec.ts e2e/correction-workspace.spec.ts e2e/p16-ear-degrees.spec.ts e2e/p22-01-function-colors.spec.ts e2e/responsive.spec.ts` は 70/70 PASS。

## 5. 5-4 `charPx`

- **変えていない**(`full: 10.5`・`narrow: 8.6`・`tiny: 6.8` のまま)。`e2e/correction-workspace.spec.ts`(上の 70 件の中)・`e2e/p5-26-1-ui-fixes.spec.ts`・`e2e/p5-26-2-overview.spec.ts`(10/10)が通った。

## 6. 基準の写真 8 枚

- 更新した物(`e2e/visual.spec.ts-snapshots/`):`capture-analysis-results-chromium-desktop-win32.png`・`capture-empty-…`・`capture-source-selection-…`・`home-…`・`practice-…`・`progression-detail-default-…`・`settings-…`・`vault-…`。
- 前(master の写真):`p89-generated/p23-01/baselines/before/`。後:`p89-generated/p23-01/baselines/after/`(どちらも同じ 8 つの名前)。
- 更新は `npm run test:e2e:update-baselines` を 1 回(990 PASS・2 skip)。変わったのはこの 8 枚だけ(`git status` で確かめた)。
- 更新したあとの 8 枚を 1 枚ずつ見た:日本語と英数字が出ている(□・空白なし)/字が箱からはみ出していない/行の折れ方は前と同じ(例:取り込み前の確認の「コードとメロディが混ざっていたら（全パート共通）」は前も後も 2 行)。8 枚の中に ♯ ♭ の入ったコード名は無かった(♯ ♭ は下の §6 の写真で確かめた)。

## 7. §6 の確かめ

- 写真:前 `p89-generated/p23-01/before/`、後 `p89-generated/p23-01/after/`。15 画面(`home`・`vault`・`capture-empty`・`pre-analysis`・`correction`・`progression`・`text`・`vl-practice`・`dojo-home`・`dojo-list`・`dojo-practice`・`ear-play`・`master`・`bass-degree`・`settings`)× 5 サイズ(1280×720・1366×768・1440×900・1920×1080・768×640)、それぞれ 75 枚。撮り方は P23-00 と同じ(一時的な e2e のファイルを置いて `npm run test:ui` で撮り、撮ったあとに消した。テスト用のデータだけ)。
- 自分で見たのは、上の 8 枚の基準と、後の写真のうち `ear-play`(1280×720)・`text`(1440×900)・`dojo-list`(1280×720)・`home`(768×640)・`vl-practice`(768×640)・`master`(1280×720)と、それに当たる前の写真。75 枚全部を 1 枚ずつは見ていない(はみ出し・切れは FULL の位置のテストと 5 サイズの横はみ出しのテストが通っていることで確かめた)。

| 確かめ | 結果 |
|---|---|
| 1. □ や空白の字が無い | 確かめた・問題なし |
| 2. 日本語の太字がはっきり太い | 確かめた・問題なし(見出し「耳の課題 008…」「定番の進行」など、700 の字で太くなっている) |
| 3. SD が黄色、T・D は前と同じ | 確かめた・問題なし(`dojo-list`・`ear-play`。`dojo-practice` は FULL の `e2e/p22-01-function-colors.spec.ts` が変数どおりの色を確かめて通った) |
| 4. `ear-play` の度数が重ならない・離れすぎない | 確かめた・問題なし(「Ⅳ」「Ⅴ」「Ⅲm」「Ⅵm」「Ⅰ」。前の写真で全角の幅だった Ⅰ も、隣と重ならずに詰まって出る) |
| 5. ♯ ♭ の前後にすき間が無い | 確かめた・問題なし(`ear-play` の「B♭」・「キー F・1つ目 B♭」) |
| 6. 横のはみ出し・箱の外の字が無い | 確かめた・問題なし。前は 1 行で後に 2 行に折れた言葉:見た写真の中には**無かった** |

## 8. 気づいたこと(直していない)

- `src/views/chord-dojo/chord-dojo.css:511` のダブルフラットの寄せ(`letter-spacing: -1px`)は、全角の幅の ♭ に合わせた物と思われる(推測)。LV Symbols の ♭ は幅が狭いので、2 つが重なって見える見込みがある(画面では確かめていない)。
- 修正作業場のカードや進行の帯など、コード名を出している所の多くは `#`・`b` の半角のまま(P23-00 の A5)。♯ ♭ の字が効くのは、♯ ♭ を使って出している所(耳で弾く・Chord Dojo の一部など)だけ。
- `src/views/chord-dojo/grand-staff.css:6` の `var(--font-ui)` は、どこにも決めていない変数のまま(指示どおり触っていない)。
- テキスト取り込みの道具の行の右端「1小節目 ·…」は、前も後も同じように切れている(字の入れ替えとは関係ない)。

## 9. テストの直し

- A(探し方の直し):無し。
- B(新しい動きへの置き換え):

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `e2e/phase8.8.5-final-ui.spec.ts`「Final Capture empty and populated states…」:`IBM Plex Sans JP` 400 が読める・本文の字に `IBM Plex Sans JP` が入っている・`IBM Plex Mono` が読める | 同じテストで:`Inter` 400・`Noto Sans JP` 400・`Noto Sans JP` 700・`LV Symbols` 600・`IBM Plex Mono` 400 が読める/本文の字に `LV Symbols`・`Inter`・`Noto Sans JP` が入り、`IBM Plex Sans JP` が入っていない | §5-1 |
| (足したテスト)`e2e/p23-01-fonts.spec.ts` 5 件:字の並び順と `--font-mono`/♭ ♯ が狭い/Ⅰ が狭く Ⅳ が 1 字/SD・SDm の黄色と T・D の色/字のファイルをネットから取らない | — | §5-2 |

- 「no font file is fetched from the network」は、URL の道筋(`pathname`)が `woff`・`woff2`・`ttf`・`otf` で終わる物を集めた(問い合わせの文字が付いても見落とさないため)。
- 基準の写真:上の 6 の 8 枚。

## 10. 指示書どおりにできなかった所

- 無し。
- 補足:§4 の `README.md`・`README.en.md` は「## License」がファイルの最後の節なので、どちらもファイルの最後に空行と 1 行を足した。`README.en.md` の節は箇条書きだが、指示の 1 行をそのまま(箇条書きにせず)足した。

## 11. FULL の結果

| 回 | いつ | コミット | 結果 |
|---|---|---|---|
| 1 | 2026-11-11 15:24 開始(日本時間) | `b3f50f78` | **PASS** — 846.6 秒。Vitest full 6394/6396(2 skip)・Playwright full 937/939(2 skip)・Playwright heavy 53/53・goto の開き直り 0 回・Tracked PNG check PASS |

- FULL は 1 回だけ回した。
