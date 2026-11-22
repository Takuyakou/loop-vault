# P23-10 Vault の一覧 — 報告

## 1. ブランチとコミット

ブランチ `feat/p23-10-vault-list`(master `5ce8e4f7` から)。このセッションが自分で実装した。

| コミット | 名前 |
|---|---|
| `7cce6e9a` | p23-10-00: CLAUDE.md runs FULL only when the stage instruction says so |
| `b523ea3c` | p23-10-01: the Vault list rebuilt (V1–V12) |
| `b39c564b` | p23-10-02: tests |
| `2bc8121b` | p23-10-03: the vault baseline |
| `9f24667e` | p23-10-04: the Bass home-card count reads 「今日 1 回」 (from P23-09) |
| (この報告) | p23-10-05: report |

## 2. やったこと

- **CLAUDE.md**:指示書の「後」の 4 行に置き換えた。`validate:ai-handoff`・`validate:phase-docs` は PASS。
- **V1**:左の絞り込みの列と、狭い窓の引き出しをやめた。上に「キーの帯」を置いた(メジャー 12・マイナー 12。五度圏の順で、ホームの輪と同じ)。
  - 帯のマスは、そのキーの進行の数で色の濃さが変わり、数も出る。0 件のマスは押せない。
  - 押すとそのキーだけで絞る(1 度に 1 つ。同じキーの別のつづり `Eb major`・`D# major` は 1 つのマスにまとまる)。もう一度押すか「キーを外す」で外れる。
  - その下に絞り込みの札の行:♥ お気に入り(数つき)/取り込み元 ▾/長さ ▾/タグ ▾(押すと値の一覧が開く。今の `Popover`)/すべて外す/件数。
- **V2**:行は 58px にした。左から ▶ ・名前(下の行に取り込み元の印・キー・小節数)・コードの帯・♥・›。
  - 行を 1 回押すと選び、右に中身が出る。選んである行をもう一度押すか、ダブルクリックか、Enter で進行のページを開く。
  - コードの帯の札の下に、役割の色(T・SD・SDm・D)の線を付けた。キーの無い進行には付けない。
  - BPM・保存した日・タグは、行から右の中身へ移した。
- **V3**:行の右は ♥ と「進行を開く ›」の 2 つだけにした。コピーは右の中身の「コードをコピー」と C キー。
- **V4**:コードの帯は今の `chordBand.ts` のまま(幅は長さに合わせる・入る分だけ・「+N小節」)。
- **V5**:並び順が「新しい順」のときだけ、日付の見出し(今週=月曜 0 時から/今月=1 日から/それより前)を入れる。
  - 50 件を超えて見えている分だけ描く形でも、見出しを含めて位置を計算する(行 58px・見出し 30px)。
- **V6**:「選ぶと鳴らす」の切り替え(初めは切)。入れている間は、行を選ぶ(押す・↑↓)とその進行が鳴る。
- **V7**:右の中身に「同じ動きの進行(キー違い)」を出す。度数の並びが全部同じ、ほかの進行(キーの無い物は除く)。押すとその行を選ぶ。
- **V8**:右の中身の並びは、名前/キー・BPM・小節・取り込み元・保存日/▶ とコードの札(押すと鳴る。役割の色と度数)/Chord Dojo の進み・この 1 週間で開いた回数/タグ・メモ(見るだけ)/同じ動き。
  - 下のボタンの並びは指示書のとおり:「MIDI を DAW へドラッグ」(今の `ProgressionMidiControl` に `label`)→[開いて編集|コードをコピー]→「Voicing Loop で弾く」→「Chord Dojo で覚える」。
  - Voicing Loop と Chord Dojo は、App の `openProgressionVoicingPractice`・`openChordDojo` を呼ぶ(P23-08 の練習の記録もそこで入る)。
- **V9**:「進行のない曲(n 件)」の折りたたみは、今のまま一覧のいちばん下(絞り込みが無いときだけ)。
- **V10**:テキストで保存した進行は「テキスト」と出る。やり方は 3 の 1 つ目。
- **V11**:↑↓・Space・Enter・C・S・/ と、検索の欄(`#vault-search`)・`queryVault` は変えていない。`queryVault` の返す形も変えていない(`useVaultLibraryFilters` に `setKeys` と `rows` を足しただけ)。
- **V12**:ホームの「キーで聴く」の「ほか n 件を Vault で見る」から、そのキーで絞った Vault を開く。
  - App が `keyRequest`(キーの帯のマス `major:0` など)を Vault に渡し、Vault が使ったら消す。
  - `HomeView.tsx` は `openVault` の型と、押したときの 2 か所だけを触った。

新しいファイル:`src/views/vault/vaultShape.ts`(キーの帯・日付の見出し・役割の色・同じ動きの計算)。

## 3. 指示書どおりにできなかった所

1. **V10 の「保存のときに `textSource` が入るようにする」はやっていない。**
   - `textSource`(`SavedTextSourceV1`)は「拡張の書き方」のテキストを丸ごと残す記録(`dialect: "extended-v1"`)。入っていると、保存のときのコード名の読み方(`textProgressionChordForSave` の `extended`)と、鳴らす音の決め方(`resolveTimelineVoicings` の `textDerived`)が変わる。ふつうの形のテキストに入れると、保存した物の意味と鳴る音が変わってしまう。
   - その代わり、指示書の 2 つ目の道(見分けられる手がかりで「テキスト」と出す)をとった。テキストの保存の 3 つの道(ふつうの形・修正作業場から・拡張)は、どれも `createSavedTextProgressionBlock` か `extendedTextPractice` で `analyzerVersion: "text-progression-v1"` を入れていて、ほかの所はこの値を入れない(コードを読んで確かめた)。
   - そこで `progressionSourceKind` が、`textSource` があるときに加えて、この値のときも「テキスト」を返すようにした。データは変えていないので、もう保存してある進行にも効く。
2. **コミットの分け方**:指示書は V1〜V5/V6〜V8/V9〜V11 の 3 つに分ける形だったが、どれも `VaultView.tsx` と `vault.css` を作り直す物なので、コードは 1 つのコミット(`b523ea3c`)にした。テスト・基準の写真は別のコミット。
3. **右の中身で、見本と違う所**:
   - 見本の見出しの横の ♥ は置いていない。行に同じ名前の ♥ があり、同じ名前のボタンが 2 つになるため。
   - 見本の小さいピアノロールも置いていない(指示書の表に無いため)。
4. **狭い幅(C4)**:右の中身は、Vault の幅が 900px より狭いとき(768×640 など)は一覧の下に出る。見本に狭い幅の形が無いので、今の 1 列の作りに合わせた。1280×720・1024×768 では右に 300px で出し、キーの帯は「メジャー」「マイナー」の字を外して詰める。

## 4. 今あるテストで直した行

| ファイル:行 | 前 | 後 | 形 |
|---|---|---|---|
| `src/views/VaultView.test.tsx` の helper(新しく `facets`・`facetOption`) | 左の列 `.lv-vault-rail [data-testid='vault-filters']` の `section` から選ぶ | 上の札の行 `[data-testid='vault-facets']` の札を開いて選ぶ | A |
| 同 「filters with counted options …」(`:172`〜`:194`) | 左の列の選択肢を押す/「すべて解除」 | 札を開いて選択肢を押す/「すべて外す」(期待の数・件数・押せない物は同じ) | A(「すべて外す」は V1 の言葉で B) |
| 同 「sorts by the four orders …」(`:229`) | `.lv-vault-rail` の「お気に入り」 | 札の行の「お気に入り」 | A |
| 同 「labels row actions in Japanese …」(`:351`〜`:362`) | 2 行目のコピーのボタンを押す | 行の右が ♥ と「進行を開く」の 2 つだけであることを足し(V3)、コピーは右の中身の「コードをコピー」で押す(写す中身・選択が変わらないことは同じ) | B |
| 同 「shows name, key, BPM, bars, date, source and tags in the row」(`:378`〜`:388`) | 行に `data-compact`・`min-h-24`、副の行「Dマイナー · BPM 124 · 4小節 · 7月15日 · MIDI」、行のタグ | 行は選ばれていて、副の行は「MIDIDマイナー · 4小節」。BPM・日付・取り込み元は右の中身の並び(「Dマイナー」「124 BPM」「4小節」「MIDI」「7月15日に保存」)、タグも右の中身 | B(V2) |
| 同 「uses localized copy failure text …」(`:465`) | 行のコピーのボタン | 右の中身の「コードをコピー」 | A |
| 同 「keeps the search while filtering by a Smart Library tag」(`:483`) | 左の列のタグの選択肢 | 「タグ」の札を開いた選択肢 | A |
| 同 「virtualizes 1000 progression rows …」(`:494`〜`:498`) | `data-row-height` 96・`data-compact`・`h-24` など | `data-row-height` 58、行の箱の高さ 58px(マウントした行が 100 未満・名前の `title`・「1000件」は同じ) | B(V2) |
| `e2e/vault-flow.spec.ts:18` | `page.getByText(/Midnight E2E Progression/)` | `.lv-vault-row` の中で探す(右の中身の見出しにも同じ名前が出るため) | A |
| `e2e/vault-flow.spec.ts:19` | `#main-content` の `status` | `vault-facets` の中の `status`(右の中身の「MIDI を DAW へ」にも `status` があるため) | A |
| `e2e/vault-flow.spec.ts:61`〜`:79` | 左の列の選択肢・「すべて解除」 | 札を開いた選択肢・「すべて外す」(期待は同じ) | A |
| `e2e/vault-flow.spec.ts:116` | `.lv-vault-main-cell` の幅 | `.lv-vault-progression` の幅 | A |
| `e2e/correction-workspace-save.spec.ts:54` | `page.getByText("P10 作業場から保存")` | `.lv-vault-row` の中で探す | A |
| `e2e/p23-02-toast.spec.ts:13` | 行の「進行をコピー」 | 右の中身の「コードをコピー」(お知らせの確かめは同じ) | B(V3) |
| `e2e/phase5.16-production-activation.spec.ts:57` | `/今日 [1-9]\d*回/` | `/今日 [1-9]\d* 回/` | **P23-09 から来た直し**(B。ANSWER のとおり `e2e/p22-03-home.spec.ts:147` と同じ形) |

基準の写真:`vault-chromium-desktop-win32.png` の 1 枚だけを更新した。全部を作り直したとき、`capture-analysis-results` と `capture-source-selection` も変わった(上の帯の MIDI・テキストの切り替えの所。4704px)。ただ、前の写真のままで `visual.spec.ts` が通ったので、撮った時の動きの途中だったと判断して、元に戻した。前・後・差は `p89-generated/p23-10/baselines/`。

**P23-09 から来た直し**:上の表の最後の 1 行だけ。ANSWER の `git grep` で、ほかの古い期待を探した。見つかったのは、コメント・テストの題・P23-09 ですでに直したホームのテスト・Chord Dojo の `HOME_NAME` だけで、直す物は無かった。

## 5. 新しいテスト(確かめることの番号ごと)

| 番号 | 単体 | e2e(`e2e/p23-10-vault-list.spec.ts`) |
|---|---|---|
| V1 | `vaultShape.test.ts`「has 12 majors … circle of fifths」「puts every spelling … one cell」「chooses every saved spelling …」 | 「V1/C3: the key band counts each key, chooses one key at a time …」(札の「取り込み元」も) |
| V2 | `vaultShape.test.ts`「gives T / SD / D from the key …」 | 「V2/V3/C3: 58px rows, one click shows the contents, a second click opens …」 |
| V3 | `VaultView.test.tsx`「labels row actions …」 | 同上 |
| V4 | (今の `chordBand.test.ts`) | `vault-flow.spec.ts`「P8.9-09b Vault row chords are one band …」(今あるテスト) |
| V5 | `vaultShape.test.ts`「今週 since Monday …」、`VaultViewP2310.test.tsx` C2 | 「V5: date headings only with 新しい順」 |
| V6 | — | 「V6: with 選ぶと鳴らす on, choosing a row plays it …」 |
| V7 | `vaultShape.test.ts`「finds the progressions with the same degrees …」 | 「V7/V8: same motion in another key, and the contents' buttons in order」 |
| V8 | `VaultView.test.tsx`「shows name, key, BPM …」 | 同上(ボタンの並びと、Voicing Loop が開くこと) |
| V9 | `VaultViewP2310.test.tsx`「V9: the folded 「進行のない曲」 …」 | — |
| V10 | `vaultShape.test.ts`「reads the text parser's analyzer version …」 | 「V10/V11: text saves say テキスト; ↓ moves, C copies, / searches」 |
| V11 | 今ある `VaultView.test.tsx` のキーの確かめ | 同上 |
| V12 | `VaultViewP2310.test.tsx`「V12: a key request …」 | 「V12: the Home's 「ほか n 件を Vault で見る」 opens the Vault on that key」 |
| C2 | `VaultViewP2310.test.tsx`「C2: 200 progressions draw only the rows in view …」、今ある 1000 件のテスト | 「C2: an empty Vault guides to capture; one progression shows its contents」 |
| C3 | `vaultShape.test.ts`(数に入らない・色が無い) | 「V1/C3 …」「V2/V3/C3 …」 |
| C4 | — | 「C4/C5: four widths …」(4 つの幅で横にはみ出さない。768 では右の中身が一覧の下) |
| C5 | — | 同上(右の中身を開いた状態で axe の serious・critical 0) |

## 6. 最後の確かめ

| コマンド | 結果 |
|---|---|
| `npm run lint` | 通過 |
| `npm run build` | 通過 |
| `npm run test:fast -- src/views/vault src/views/VaultView.test.tsx src/views/HomeView.test.tsx src/views/home` | PASS 6665/6667(2 は前からの skip) |
| `npm run test:ui -- `(名前に vault を含む spec 全部・p23-07・visual・accessibility・keyboard・responsive・ホームの 3 本・p23-02-toast・correction-workspace-save) | PASS 79/79 |
| `npm run test:ui -- e2e/phase5.16-production-activation.spec.ts`(P23-09 から来た直しのあと) | PASS 2/2 |
| `npm run test:full`(1 回目。`9f24667e`) | **PASS(892.9 秒)**。Vitest full 6665/6667、Playwright full 1018/1020(2 は前からある条件つきの飛ばし)、heavy 53/53、goto の開き直り 0 回。Git diff check・Tracked PNG check PASS |

FULL は 1 回だけ回した。その前に、P23-09 から来る失敗 1 件を見つけて止まり、QUESTION を書いた(ANSWER のとおり直した)。

## 7. 写真

`p89-generated/p23-10/`:`vault-1440x900.png`・`vault-1280x720.png`・`vault-1024x768.png`・`vault-768x640.png`・`vault-facet-open-1440x900.png`(進行 8 件。テキストで保存)。基準の写真の前・後・差は `baselines/`。

自分の目で見た物:
- 1440×900・1024×768・768×640・1280×720・札を開いた所
- 基準の写真の後の `vault`(長い題が行で「…」になる)
- 差の `capture-source-selection`

見て直した所:
- 「コードをコピー」の字が 2 行に折れていたので、折れないようにした。
- 1024×768 でキーの帯が詰まりすぎていたので、狭いときはキーの帯の「メジャー」「マイナー」の字を外し、右の中身を 300px にした。
- 長い題が 58px の行からはみ出していたので、1 行で「…」にした。

## 8. 次の指示書が使う物

- `src/views/vault/vaultShape.ts`:
  - `KEY_BAND`(`{ major, minor }`。各 `{ id: "major:0", mode, label: "C", name: "C メジャー" }`)
  - `keyCellOf(key?: string): string | undefined`
  - `keyCellCounts(Map<string, number>)`
  - `keysInCell(cell, keys)`
  - `selectedKeyCell(keys)`
  - `dateGroupOf(capturedAt, now): "今週" | "今月" | "それより前"`
  - `chordRoles(block, key): string[]`
  - `degreeShape(row)`
  - `sameMotion(row, rows): VaultRow[]`
- `VaultView` の新しい props:
  - `openVoicingLoop?(ref)`
  - `openChordDojo?(ref)`
  - `keyRequest?: string`(キーの帯のマス)
  - `onKeyRequestDone?()`
- `HomeView` の `openVault` は `(keyCell?: string) => void` になった。
- `useVaultLibraryFilters` に `setKeys(keys)` と `rows` を足した。
- `progressionSourceKind` は、`analyzerVersion === "text-progression-v1"` も「テキスト」にする。
- 右の中身の testid:`vault-preview`・`vault-same-motion`。一覧:`vault-key-band`(マスは `data-key-cell`)・`vault-facets`・`vault-date-heading`。

## 9. 気づいたこと(直していない)

- `src/views/vault/VaultFilterPanel.tsx` の部品(左の列)はもう画面に出ない。`tagLabel` だけを使っている。部品と、その CSS(`vault.css` から外した `.lv-vault-filters` など)は使われていない。
- 行と右の中身のキーの名前は、今の `displayKey` のまま「Ebメジャー」と出る(♭ ではない)。キーの帯は「E♭」。
- 右の中身の「Chord Dojo」の欄は、今の `PracticeProgressBadge` が何も出さないとき(まだ練習していないとき)は「まだ」と出す(CSS の `:empty`)。
- 「選ぶと鳴らす」の状態は残さない(Vault を開くたびに切)。
