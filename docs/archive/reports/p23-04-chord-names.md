# P23-04 コード名(♯ ♭)と度数(Ⅱm7)の報告

指示書:`P23-04-chord-names.md`(README `P23-00-README.md` の決まりに従う)。master へのマージと push はしていない。

## ブランチとコミット

ブランチ `feat/p23-04-chord-names`(master `dfdff787` から)。作業の場所は `<作業フォルダ>/Loop Vault-p23`。

| コミット | 内容 |
|---|---|
| `4785aa6c` | p23-04-01: display text for chord names and degrees |
| `2ecb875f` | p23-04-02: ChordName — root large, kind at 0.8× |
| `fc6380e0` | p23-04-03: chord names with ♯ and ♭ on Home, Vault, the workspace, Voicing Loop and Chord Dojo |
| `e9b90296` | p23-04-04: degrees in one form (Ⅱm7) on every screen |
| `7844abb9` | p23-04-05: tests and baselines |
| (この報告) | p23-04-06: report |

## 節ごとに変えたこと

- §1 `src/ui/chordText.ts`(新規):`displayChordLabel`・`splitChordLabel`・`displayDegreeLabel`。指示書のコードをそのまま入れた。`src/views/ear-practice/label.ts` は `chordText` の `displayChordLabel` を出し直すだけにした。`src/ui/chordText.test.ts`(新規)で指示書の表の値を 1 つも変えずに全部確かめ、`degreeOf` の実際の値(C メジャーで `Dm7`→`Ⅱm7`、`Bb7`→`♭Ⅶ7`、`Am`→`Ⅵm`、`Bm7b5`→`Ⅶm7♭5`、`C/E`→`Ⅰ/3rd`)も確かめた。
- §2 `src/components/ChordName.tsx`(新規)と `ChordName.test.tsx`(3 件)、`src/styles/components.css` に `.lv-chordname`・`.lv-chordname-acc`・`.lv-chordname-kind`。(a) Chord Dojo の練習のカードの名前(`PracticeFrame.tsx`)、(b) Voicing Loop の今のコード(`ProgressionVoicingPracticeView.tsx` の h2。`title` と `sr-only` は変えていない)。
- §3 T1〜T12(下の表)。
- §4 D1〜D9(下の表)。D9 は `romanNumeralHint` の import を消して `degreeOf` に置き換えた。`romanNumerals.ts` とそのテストは触っていない。
- §5 テストの直し(下の表)と見た目の基準の写真。
- §6 後の写真と確かめ 1〜6。§7 FULL。

### T1〜T12(コード名を ♯ ♭ で出す)

全部、指示書の式が見つかり、そのとおり直した(行は数行ずれていたが同じ式)。

| # | 場所 | 結果 |
|---|---|---|
| T1 | `HomeView.tsx` `lv-home-chip-name` | 直した |
| T2 | `HomeView.tsx` `lv-home-recent-chip` | 直した |
| T3 | `VaultView.tsx` `lv-vault-chip-label` | 直した |
| T4 | `CorrectionWorkspace.tsx` `{label.text}`(`data-full-name` と `cardLabel` はそのまま) | 直した |
| T5 | `WorkspaceSaveForm.tsx` | 直した |
| T6 | `DraftBoundaryHandles.tsx` | 直した |
| T7 | `QuickChordEditor.tsx` 候補の名前 | 直した |
| T8 | `ProgressionGrid.tsx` | 直した |
| T9 | `ProgressionVoicingPracticeView.tsx` 下の帯 | 直した |
| T10 | `BuiltinProgressionList.tsx` 定番のカードの `<small>` | 直した |
| T11 | `BuiltinProgressionList.tsx` Original Practice のコード | 直した |
| T12 | `DojoHome.tsx` 今日のレッスン | 直した |

### D1〜D9(度数を「Ⅱm7」の形で出す)

全部、式が見つかり、そのとおり直した。関数(`degreeFunctionKinds` など)と `aria-label` には元の文字を渡したまま。

| # | 場所 | 結果 |
|---|---|---|
| D1 | `PracticeFrame.tsx` `.dojo-endless-degree` | 直した |
| D2 | `PracticeFrame.tsx` `FnDegrees` | 直した |
| D3 | `HomeView.tsx` チップの度数 | 直した |
| D4 | `VaultView.tsx` `.lv-vault-chip-degree` | 直した |
| D5 | Voicing Loop 今の度数 | 直した |
| D6 | Voicing Loop 次の度数 | 直した |
| D7 | Voicing Loop その次の度数 | 直した |
| D8 | Voicing Loop 下の帯の度数 | 直した |
| D9 | `TextProgressionCapturePanel.tsx` カードの度数 | 直した(N4) |

## テストの直し

A(探し方だけ)は 0 件。C(弱める)は 0 件。関数の値を確かめる単体テスト(`degreeOf`・`formatChordSymbol`・`cardLabel`・`degreeFunctionKinds` など)は 1 つも直していない(落ちなかった)。

### B(新しい動きへの置き換え)の対応表

古い確かめ 1 つに新しい確かめ 1 つ(同じ所・同じ強さで、期待する文字だけ新しい形)。

| ファイル:行 | 前 | 後 | 根拠 |
|---|---|---|---|
| `src/views/ProgressionVoicingPracticeView.test.tsx:863` | `Eadd9/F#` | `Eadd9/F♯` | N1・N2 |
| `src/views/VaultView.test.tsx:389` | `Cmaj7♭VIImaj7` | `Cmaj7♭Ⅶmaj7` | N3 |
| `src/components/capture/TextProgressionCapturePanel.test.tsx:292` | `ii`(`romanNumeralHint`) | `Ⅱm7`(`degreeOf`) | N3・N4 |
| `e2e/p12-3-dojo.spec.ts:162` | `'IVmaj7 – V7 – iii7 – vi7'` | `'Ⅳmaj7 – Ⅴ7 – Ⅲm7 – Ⅵm7'` | N3 |
| `e2e/p12-3-dojo.spec.ts:177` | `'ii7 – V7 – Imaj7'` | `'Ⅱm7 – Ⅴ7 – Ⅰmaj7'` | N3 |
| `e2e/p12-3-dojo.spec.ts:222` | `['IVmaj7','V7','iii7','vi7']` | `['Ⅳmaj7','Ⅴ7','Ⅲm7','Ⅵm7']` | N3 |
| `e2e/p12-4-progressions.spec.ts:26` | `'Imaj7/V – ♭VIImaj7/V – ♭VImaj7/V – V7sus4'` | `'Ⅰmaj7/Ⅴ – ♭Ⅶmaj7/Ⅴ – ♭Ⅵmaj7/Ⅴ – Ⅴ7sus4'` | N3 |
| `e2e/p12-4-progressions.spec.ts:32` | `'ii7 – V7 – Imaj7'` | `'Ⅱm7 – Ⅴ7 – Ⅰmaj7'` | N3 |
| `e2e/p12-4-progressions.spec.ts:39` | `'iiø7 – V7(♭9) – i(maj7) – i(maj7)'` | `'Ⅱø7 – Ⅴ7(♭9) – Ⅰm(maj7) – Ⅰm(maj7)'` | N3 |
| `e2e/p12-5-original.spec.ts:156` | `'F#dim7'` | `'F♯dim7'` | N1・N2 |
| `e2e/p19-voicing-drill.spec.ts:92` | `"I – VIm7 – IVΔ7 – V7"` | `"Ⅰ – Ⅵm7 – ⅣΔ7 – Ⅴ7"` | N3 |
| `e2e/p22-01-function-colors.spec.ts:25` | `["IVmaj7","V7","iii7","vi7"]` | `["Ⅳmaj7","Ⅴ7","Ⅲm7","Ⅵm7"]` | N3 |
| `e2e/phase5.20-text-progression.spec.ts:163` | `/I.*V.*vi.*IV/` | `/Ⅰ.*Ⅴ.*Ⅵm.*Ⅳ/` | N3 |
| `e2e/vault-flow.spec.ts:119` | `/^Ebadd9\/G×3/` | `/^E♭add9\/G×3/` | N1 |

新しいテスト:`src/ui/chordText.test.ts`、`src/components/ChordName.test.tsx`、`e2e/p23-04-chord-names.spec.ts`(Vault のコード名に `#`・`[A-G]b` が無く ♯ ♭ がある/Vault の度数が `Ⅰ〜Ⅶ` で始まる/Voicing Loop の今のコードが `F♯m7` で種類の字が 0.8 倍/Chord Dojo の練習のカードの度数に半角の I V i v が無い)。

### 見た目の基準の写真

8 枚全部を `--update-snapshots=all` で作り直し、8 枚全部の前・後・差を見た。変わったのは `vault-chromium-desktop-win32.png` の 1 枚だけ(206 px。チップの下の度数の字だけ)。ほかの 7 枚は 1 px も変わっていない。前・後・差は `p89-generated/p23-04/baselines/{before,after,diff}/`。

## 写真

- 前:`p89-generated/p23-04/before/`(8 種類 × 1440×900・1280×720 = 16 枚)
- 後:`p89-generated/p23-04/after/`(8 種類 × 1440×900・1280×720、`dojo-jazz-practice`、`voicing-loop-768x640`、`dojo-practice-768x640`、`♭♭` の拡大 `dojo-jazz-dflat-closeup.png`)
- 確かめのログ:`p89-generated/p23-04/checks/`(`log-*.txt`、名前の窓の写真 `quick-editor.png`)

後の写真で目で見たのは、`home-1440x900`・`vault-1440x900`・`text-intake-1440x900`・`voicing-loop-1440x900`・`voicing-loop-768x640`・`dojo-builtin-list-1440x900`・`dojo-practice-768x640`・`dojo-jazz-practice-1440x900`・`dojo-jazz-dflat-closeup` の 9 枚。残り(1280×720 の各枚、`progression-page`・`dojo-drill-list`)は目では見ておらず、はみ出し・字切れは下の確かめ 5 の数で確かめた。

## §6 の確かめ

確かめは一時的なテスト(e2e に置いて回し、回したあと消した。リポジトリには入れていない)で行った。

| # | 確かめ | 結果 |
|---|---|---|
| 1 | T1〜T12 で `#` と半角の `b` が出ていない | ○(T の所は全部 ♯ ♭。ホーム 16 個、Vault 11 個、ワークスペースのカード 8 個、Voicing Loop の今のコードと下の帯、Dojo 練習のカード、定番のカードの `<small>`。表の外に残る所は「気づいたこと」) |
| 2 | D1〜D9 で度数が「Ⅱm7」の形 | ○(ホーム `Ⅵm7 Ⅱm7 Ⅴ7 Ⅰmaj7`、Vault 11 個、Voicing Loop 6 個、Dojo 練習のカードと一覧の度数 57 行、Jazz の練習 `Ⅱm9 Ⅴ13 Ⅰ6/9`、テキスト取り込み `Ⅱm7♭5`・`Ⅴ7`) |
| 3 | Vault の検索:`F#m7`・`2-5-1` で今までどおり見つかる | ○(`F#m7` で `F#m7` を持つ進行 1 件、`Bb7` で 1 件。`2-5-1` で「2-5-1 練習」が見つかり、度数が ii-V-I を含む A メジャーの進行も今までどおり「度数で一致」で出る) |
| 4 | 名前の窓は半角で出て、半角で直せる | ○(条件つき。下に書く) |
| 5 | 5 つのサイズで、はみ出し・字切れが無い | ○(ホーム・Vault・進行のページ・Voicing Loop・Chord Dojo の定番の一覧・練習・Jazz の練習で、1280×720・1366×768・1440×900・1920×1080・768×640 の全部、`body` と `#main-content` の横のはみ出し 0、`.lv-chordname` の切れ 0) |
| 6 | 保存したデータは半角のまま | ○(条件つき。下に書く) |

- 4 について:カードをダブルクリック(と F2)で開く窓は `QuickChordEditor`。見出しの名前は `draftChord.label` のまま(半角。写真 `checks/quick-editor.png` で `C`)。ただしこの窓には文字を打つ欄が無く、名前は ← → で根音を動かし、種類は選ぶ欄で直す(右を 2 回押して `C` → `D` に変わるのを確かめた)。「半角で打って直す」欄は今までも無いので、変わっていないことを確かめた。
- 6 について:書き出し(JSON)は Tauri の保存の窓を使うので、ブラウザのテストでは開けない。代わりに、保存した進行を Vault の「進行をコピー」で写した文字が `| F#m7 | Bm7 | E7 | Amaj7 |`(半角のまま、♯ ♭ 無し)、Voicing Loop の大きな名前の `data-chord-label` が `F#m7` であることを確かめた。保存・書き出しのコードは 1 行も変えていない(`git diff master -- src/storage` は空)。

## 字の見え方(§4)

- Ⅰ〜Ⅶ は、見た所(Vault・ホーム・Voicing Loop・Chord Dojo の練習のカードと一覧・テキスト取り込み)で豆腐(□)にならなかった。`LV Symbols` の字で出ていて、`m7` などの字と高さはそろって見える。Ⅰ〜Ⅶ の字は細いセリフの形なので、Inter・IBM Plex Mono の字とは形が少し違って見える(Voicing Loop の今の度数 `Ⅵ` で目立つ)。
- `var(--font-*)` を使わずに字の名前を直接書いている所は、Ⅰ〜Ⅶ が出る所には無かった(`font-family` を直接書いているのは `fonts.css` だけで、ほかは `var(--font-*)` か `inherit`)。
- `.dojo-dflat`(`♭♭`):Jazz Progressions 5 番目の項目をキー D♭ にすると、カードの音名に `B𝄫3(2)` が出る。拡大(`after/dojo-jazz-dflat-closeup.png`)で見ると、2 つの ♭ は詰まって接しているが重なってはおらず、2 つと読める。直していない。

## FULL

FULL の前に `npm run lint`・`npm run build` は通った。

### 1 回目(20:55 開始)— FAIL、ここで止めた

- 通った:Source contracts・AI handoff・Class lint・Phase docs・Runner contracts(40/40)・Privacy scan・E2E TypeScript・Production build・Repository ESLint・App TypeScript。
- 落ちた:Vitest full(93.8 秒)。575 ファイル中 1 失敗・572 通過・2 飛ばし。6474 件中 1 失敗・6471 通過・2 飛ばし。
- Vitest で止まったので、Playwright と heavy は回っていない(数は無い)。
- ログ:`.local-evaluation/test-logs/2026-11-11T11-55-48-388Z-vitest-full.log`、`…-full.log`、`…-full-metrics.json`。

落ちたテスト:`src/domain/p21SingleNoteFingering.test.ts:210`「above maxCards the hand keeps the old E1-T result」。`expect` の行(219 行 `expect(now).toEqual(old)`)で値が違ったのではなく、`Error: Test timed out in 30000ms.`(テスト自身に付けた 30 秒の時間切れ)。

この変更と関係が無いと考える理由:

- このテストが読むのは `src/domain/progressionFingering`・`handPositionFingering`・`p21SingleNoteFingering`・`eRankerFingering`・`src/voicingPractice/rankPracticeFingerings` など、運指の計算だけで、画面も文字の関数も通らない。
- この枝の変更は `src/domain`・`src/voicingPractice`・`src/storage` に 1 行も無い(`git diff --stat master -- src/domain src/voicingPractice src/storage` は空)。`chordText.ts`・`ChordName.tsx` はこのテストの読み込みの中に無い。
- 落ち方は値の違いではなく時間切れ。計算の重いテストが、FULL で全部のテストを並べて回したときに 30 秒を超えた形。

README の決まり(関係の無い失敗は回し直さず、テスト・`expect` の行・関係が無い理由を書いて止まる)に従い、FULL は 1 回だけで回し直していない。P23-02・P23-03 の分として直した物も無い。

## 指示書どおりにできなかった所

- 確かめ 4 の「半角で打って直せる」:打つ欄がそもそも無い(上に書いた)。
- 確かめ 6 の「書き出した JSON」:ブラウザでは保存の窓が開けないので、コピーした文字で代えた(上に書いた)。

## 気づいたこと(直していない)

- 表の外で、コード名がまだ半角の `#`・`b` で出る所:
  - Chord Dojo 定番の一覧の、ジャズ系のグループのカードのコード(`BuiltinProgressionList.tsx:109` `chordNames.get(id)!.join(' → ')`。例 `C：… → F#dim7 → …`、`Cmaj7 → F#m7♭5 → B7`)。T10・T11 とは別の式。
  - Voicing Loop の右の「次」の手の窓に渡す名前(`ProgressionVoicingPracticeView.tsx:1682` `chordLabel={nextEvent?.chord.label …}`)。画面に `F#m7` が出る。
  - Voicing Loop の音名(`F#4`・`C#5`)とキーの選ぶ欄(`Dbメジャー`)。音名・キー名なので、コード名とは別。
  - テキスト取り込みのカードのコード名(`F#m7b5`)。指示書の「やらない所」に入っている。
  - 修正の窓の右の見出し(`CorrectionInspector.tsx` の `correction-inspector-name`)は `card.name.label` のまま。
- 古い形の度数がまだ出る所:
  - 度数の並びの題:Chord Dojo 定番の一覧のカードの題(`ii–V–I`・`I–V–vi–IV`・`IV–iii–ii–I` など、`builtins*.ts` の題)、`.dojo-progression-degrees`(`IVmaj7–V7–iii7–vi7`、`e2e/p12-3-dojo.spec.ts:102`)、`.dojo-chord-cards>button>small:last-child`(`ii7`・`V7`・`Imaj7`、同 `:135`)、ボイシングドリルの `drill-degrees`(`I–VIm7–IVΔ7–V7`、`e2e/p19-voicing-drill.spec.ts:101`)。
  - Vault の検索で度数が一致したときの説明(`VaultView.tsx:417` 「度数で一致：ii7 → V7 → Imaj7 → Imaj7」)。
- Voicing Loop の度数は種類が付かない形(`Ⅵ`・`Ⅱ`)。元の値が種類なしの度数なので、そのまま。

## fix-1

指示書:`P23-04-fix-1.md`。ブランチは `feat/p23-04-chord-names` のまま続けた(先頭 `1d1c4623` から)。master へのマージと push はしていない。

### コミット

| コミット | 内容 |
|---|---|
| `ec4a6ebc` | p23-04-fix-1-01: sans Roman numerals in LV Symbols |
| `67a907b1` | p23-04-fix-1-02: a smaller ♯ ♭ beside the root |
| `336c742e` | p23-04-fix-1-03: the remaining chord names |
| `690baf8d` | p23-04-fix-1-04: degree lists in the same form |
| `2bda5eae` | p23-04-fix-1-05: tests and baselines |
| `ad594232` | p23-04-fix-1-05b: the progression handoff test reads the cards' degrees as Ⅱm7(FULL 2 回目で見つけた物) |
| (この節) | p23-04-fix-1-06: report |

### §1 字のファイル(X1)

zip の 3 ファイルを `src/assets/fonts/` に上書きし、sha256 が指示書の表と同じことを確かめた。

| ファイル | sha256 | 結果 |
|---|---|---|
| `lv-symbols-400-normal.woff2` | `a9f9a6e85812306467aebe19def712aae6602dae4a712877a1183ab654c69fd1` | 同じ |
| `lv-symbols-600-normal.woff2` | `1561f33f21eaf48a5201379bab742b5b27081f5dfaea03519b435551470f0f19` | 同じ |
| `lv-symbols-700-normal.woff2` | `f4178db0fd53a024337aa883412356e43fbf8b6754213885682cd6ff17d7e4e5` | 同じ |

`src/styles/fonts.css` の 1 行目と 55 行目の説明、`src/assets/fonts/SOURCE.md` の lv-symbols の行と下の説明を、指示書の文に直した(`@font-face` の中身・`unicode-range` は変えていない)。SOURCE.md の 9 行目は、実際の行が「太さは 400・600・700。ファイルの中身は変えていない(`lv-symbols` は字を減らしただけ)。」だったので、後ろの文だけを指示書の文に置き換えた。`make-lv-symbols.py` はリポジトリに入れていない。字のファイルの大きさや数を確かめるテストは無く、落ちた物も無い(`e2e/p23-01-fonts.spec.ts` の「Ⅰ is narrow and Ⅳ is one glyph」も通った)。

### §2 大きいコード名の ♯ ♭(X2)

`.lv-chordname-acc` を指示書のとおり(`top: -0.12em`・`margin: 0 0.02em`・`font-size: 0.82em`・`font-weight: 600`)にした。

### §3 R1〜R4(X3)

| # | 場所 | 結果 |
|---|---|---|
| R1 | `BuiltinProgressionList.tsx:109` | 直した(式が見つかった) |
| R2 | `ProgressionVoicingPracticeView.tsx:1668` 次のコード | 直した |
| R3 | 同 `:1687` その次のコード | 直した(`title` はそのまま) |
| R4 | `CorrectionInspector.tsx:61` 右の見出し | 直した |

### §4 L1〜L3(X4)

`src/ui/chordText.ts` の最後に `displayDegreeList` を足し、指示書の表の 10 件と `undefined` を `src/ui/chordText.test.ts` で確かめた(全部通った)。P23-04 の関数とテストは変えていない。

| # | 場所 | 結果 |
|---|---|---|
| L1 | `PracticeFrame.tsx:36` 上の行の度数の並び | 直した |
| L2 | `VaultView.tsx:417` 「度数で一致」 | 直した |
| L3 | `ChordDojoView.tsx:448` カードの `<small>{degree}</small>` | 直した |

進行の名前(`ii–V–I` などの題)は変えていない。

### §5 で見つけて直した物(fix-1 の外。P23-04 の自分の変更から出た物)

`e2e/p22-01-list.spec.ts`「pressing the card starts ① …(… the card's free part)」が、1280×720 で落ちた(「blank」のとき、王道進行のカードの `.dojo-builtin-chords` が画面の下にはみ出し、クリックが届かない)。master では通る(master の作業場所で回して確かめた)。

原因:P23-04 の D2 で、Chord Dojo の一覧の度数の行(`.dojo-builtin-degrees`)に Ⅰ〜Ⅶ が出るようになった。この行は `font:13px var(--font-mono)` で行の高さが `normal` のため、LV Symbols の字(上下の余白が大きい。古い字のファイルも新しい字のファイルも同じ 33px/16px で、fix-1 の字の差し替えとは関係ない)が入ると、行が 17px → 26px に伸び、カードが 9px 高くなっていた。

直し方:`src/views/chord-dojo/chord-dojo.css` の `.dojo-builtin-degrees` と `.dojo-endless-name i`(練習画面の上の行の度数。14px → 22px に伸びていた)の `font` に行の高さ `1.3`(IBM Plex Mono の `normal` と同じ)を足した。これで一覧の度数の行は 16.9px、カードは 140.9px(master は 17px・141px)に戻り、テストは通った。テストは直していない。Jazz Progressions の一覧(master でもすでに Ⅱm7 の形で 26px だった)も同じクラスなので 16.9px になり、カードが 9px 低くなった。

### テストの直し(B の対応表)

A は 0 件、C は 0 件。関数の値の単体テストは直していない。

| ファイル:行 | 前 | 後 | 根拠 |
|---|---|---|---|
| `src/views/VaultView.test.tsx:200` | `ii7 → V7 → Imaj7（2〜4番目のコード）` | `Ⅱm7 → Ⅴ7 → Ⅰmaj7（2〜4番目のコード）` | X4(L2) |
| `e2e/p12-3-dojo.spec.ts:135` | `['ii7','V7','Imaj7']` | `['Ⅱm7','Ⅴ7','Ⅰmaj7']` | X4(L3) |
| `e2e/p19-voicing-drill.spec.ts:101` | `"I–VIm7–IVΔ7–V7"` | `"Ⅰ–Ⅵm7–ⅣΔ7–Ⅴ7"` | X4(L1) |
| `e2e/p12-1-dojo-ui.spec.ts:53` | `['ヒント','I']` | `['ヒント','Ⅰ']` | X4(L3) |
| `e2e/p12-chord-dojo.spec.ts:43` | `['I','IV','V','vi','I','IV','V','vi']` | `['Ⅰ','Ⅳ','Ⅴ','Ⅵm','Ⅰ','Ⅳ','Ⅴ','Ⅵm']` | X4(L3)。FULL 2 回目で見つけた |

足したテスト(`e2e/p23-04-chord-names.spec.ts`):(1) 定番の練習の上の行の度数の並びに Ⅰ〜Ⅶ があり、半角の I V i v が無い。(2) カードの度数の「Ⅳ」が LV Symbols で出ていて(`document.fonts.check` が `true`)、その幅が同じ大きさ・太さの Inter の「IV」と ±1.5px で同じ。

`e2e/p12-3-dojo.spec.ts:102`(`.dojo-progression-degrees` = 進行の名前)は変わらず、通っている。

### 基準の写真

8 枚全部を作り直し、8 枚全部の前・後・差を見た。変わったのは `vault-chromium-desktop-win32.png` の 1 枚(182 px。チップの下の度数 Ⅰ・Ⅵm・Ⅳ・Ⅴ の字の形だけ)。ほかの 7 枚は 0 px。前・後・差は `p89-generated/p23-04-fix-1/baselines/{before,after,diff}/`。

### 写真

`p89-generated/p23-04-fix-1/after/`(1440×900 と 1280×720):`voicing-loop`(C♯m7。次 F♯7・その次 Bmaj7)/`dojo-practice`(王道進行)/`dojo-builtin-list`/`dojo-builtin-list-jazz`(ジャズ・フォームのカード。F♯dim7 など)/`vault`/`vault-degree-match`(`2-5-1`)/`progression-page`/`progression-page-selected`(C♯m7 を選び、右の見出しが `C♯m7`)。

目で見たのは、`dojo-practice-1440x900`・`voicing-loop-1440x900`・`dojo-builtin-list-jazz-1440x900`・`vault-degree-match-1440x900`・`progression-page-selected-1440x900` と、基準の写真の差 `vault` の 6 枚。Ⅰ〜Ⅶ は飾りのない I・V を並べた形で出て、隣の `maj7`・`m7` と形が合って見えた。大きいコード名の ♯ は前より小さく細くなった。

### 関係するテスト

- `npm run test:fast -- src/views/VaultView.test.tsx src/ui/chordText.test.ts`:PASS(6483/6485。2 は飛ばし)。
- `npm run test:ui`(p23-04・p12-3・p19・correction-workspace・p5-26-1・vault-flow・jazz-progressions・p18・p12-1・p23-01-fonts・p12-4・p12-5・p22-01-function-colors・p22-01-list・visual):1 回目は 2 件落ちた(`p12-1-dojo-ui.spec.ts:53` は上の B、`p22-01-list.spec.ts:28` は上の行の高さ)。直したあとの 2 回目は PASS(267/267)。
- `npm run lint`:PASS。`npm run build`:PASS。

### fix-1 で気づいたこと(直していない)

- 修正の窓の右の「コードを替える」の候補の名前(`.lv-cw-alt-name`。例 `F#7`・`Abm7`・`Bbm7b5`・`Ebm7`)は半角のまま。
- Voicing Loop の音名(`C#4`・`A#5`)は半角のまま(指示書で触らない所)。

### FULL(全部の回)

- 1 回目(P23-04、11 月 11 日 20:55 開始):FAIL。Vitest full で `src/domain/p21SingleNoteFingering.test.ts:210` が時間切れ(上の「FULL」の節)。Playwright と heavy は回っていない。
- 2 回目(fix-1、11 月 12 日 0:24 ごろ開始、`2bda5eae`):FAIL。Vitest full PASS(6483/6485。2 は飛ばし)。Playwright full FAIL(492 秒。1 失敗・948 通過・2 飛ばし)。heavy は回っていない。落ちたのは `e2e/p12-chord-dojo.spec.ts:43`(`.dojo-chord-cards > button > small:last-child` が `['I','IV','V','vi',…]` を期待し、`['Ⅰ','Ⅳ','Ⅴ','Ⅵm',…]` が出た)。L3 の変わった文字で、この変更による物。B で直し(上の表)、`npm run test:ui -- e2e/p12-chord-dojo.spec.ts` で PASS(52/52)を確かめ、`ad594232` にした。ログ:`.local-evaluation/test-logs/2026-11-11T15-24-23-563Z-playwright-full.log`。
- 3 回目(fix-1、`ad594232`):FAIL。Source contracts から App TypeScript まで PASS、Vitest full PASS(6483/6485)、Playwright full FAIL(483 秒。2 失敗・947 通過・2 飛ばし)。heavy は回っていない。ログ:`.local-evaluation/test-logs/2026-11-11T15-37-37-498Z-playwright-full.log`。
  - `e2e/dojo-list-scroll.spec.ts:98`「when the window changed size meanwhile …, the button that was pressed is in view」:83 行の `expect.poll(…).toBe(true)`(押したボタンが画面の中にあるか)が 5 秒で `true` にならなかった。
  - `e2e/p5-26-2-overview.spec.ts:85`:`expect(await scrollLeft(page)).toBeGreaterThan(from)`(帯をドラッグしたあとピアノロールが横に動いたか)。1524 のまま。
  - 関係が無いと考える理由:2 回目と 3 回目の間に変えたのは `e2e/p12-chord-dojo.spec.ts` の期待の 1 行だけで、画面のコードは 1 文字も変わっていない(`git diff 2bda5eae ad594232 --stat` はこの 1 ファイル)。この 2 つのテストは、同じ画面のコードで回した 2 回目では通っている。どちらも、スクロールやドラッグの位置を短い時間で測るテストで、コード名・度数の文字は確かめていない。
  - README の決まり(FULL は 3 回まで。関係の無い失敗は回し直さず、書いて止まる)と、fix-1 の例外 2 つ(Bass の「余分な音」/Vitest の時間切れ)に当たらないことから、ここで止めた。FULL は通っていない。

### FULL のあとの確かめ(レビュー合格のあと。FULL は回していない)

コードは変えていない(この節を足しただけ)。テストの回し方も変えていない。回すときは `node scripts/run-playwright-visual-tests.mjs`(FULL の Playwright と同じ実行の部品。型の確かめとビルドもその中で行う)を使い、ほかのテスト・ビルドは同時に動かしていない。

1. 3 回目で落ちた 2 本を 1 回ずつ回した(`39e065dd`):
   - `e2e/p5-26-2-overview.spec.ts`:PASS(6/6)。
   - `e2e/dojo-list-scroll.spec.ts`:FAIL(1 失敗・13 通過)。落ちたのは 3 回目と同じ `e2e/dojo-list-scroll.spec.ts:98`「when the window changed size meanwhile and the same scroll cannot be had, the button that was pressed is in view」。`expect` の行は 83 行の `expect.poll(()=>page.evaluate(…)).toBe(true)`(1000×640 に変えて Esc で一覧に戻ったとき、フォーカスのある `jazz:` のボタンが画面の中にあるか)。5 秒待っても `false` のまま。
   - 3 回目のような負荷のある回だけでなく、この spec を 1 本だけで回しても落ちたので、たまたま落ちた物とは言えない。なお FULL の 2 回目(`2bda5eae`。画面のコードは今と同じ)ではこのテストは通っている。原因は調べておらず、直していない。
2. heavy の 6 本は、指示(落ちたら直さず・回し直さずに止まる)に従い、**回していない**。

ログ:`<作業フォルダ>/claude-scratch/p2304/fix1-rerun/`(リポジトリの外)。

## fix-2

`e2e/dojo-list-scroll.spec.ts:98`「when the window changed size meanwhile and the same scroll cannot be had, the button that was pressed is in view」を、P23-04・fix-1 の変更で出た不具合として調べて直した。ブランチは `feat/p23-04-chord-names` のまま。master へのマージと push はしていない。

### コミット

| コミット | 内容 |
|---|---|
| `b16bc0a2` | p23-04-fix-2-01: keep the pressed button in view while the list settles |
| (この節) | p23-04-fix-2-02: report |

### 1. 調べたこと

**通る回数**(このテスト 1 本を `--repeat-each=5` で 5 回。`node scripts/run-playwright-visual-tests.mjs`、ほかは何も動かさずに):

| | 通った回数 |
|---|---|
| master `dfdff787` | 5 / 5 |
| ブランチ `ea171d42`(直す前) | 0 / 5 |

**Esc で戻った直後の記録**(ブランチ・直す前。`#main-content` が一覧のスクロールする箱。押した後で 1280×720 → 1000×640 に変えてから Esc。毎フレーム記録し、変わったフレームだけ書く。t は Esc からのミリ秒):

| t | 一覧の幅(clientWidth) | サイドバーが動いている | scrollHeight | scrollTop | 押したボタン(top〜bottom) |
|---|---|---|---|---|---|
| 32 | 768 | はい | 5936 | 0 | (まだフォーカスなし) |
| 35 | 768 | はい | 5936 | 5283 | 619.33〜640.33 |
| 49 | 770 | はい | 5921 | 5268 | 619.33〜640.33 |
| 65 | 814 | はい | 5833 | 5179 | 619.64〜640.64 |
| 81 | 861 | はい | 5755 | 5101 | 619.86〜640.86 |
| 99 | 887 | はい | 5738 | 5084 | 619.97〜640.97 |
| 149 | 924 | はい | 5721 | 5068 | 619.17〜640.17 |
| 249 | 936 | いいえ | 5721 | 5068 | 619.17〜640.17(このまま 5 秒) |

画面の下の端は 640(`window.innerHeight` と一覧の箱の下の端が同じ)。テストは `bottom <= 640` を確かめるので、640.17 で落ちる。master で同じ記録を取ると、ボタンは 619.16〜640.16 から動いて、最後は 618.56〜639.56 で止まっていた(だから通る)。

**本当の原因**:

- 窓を狭くしたあとに一覧に戻ると、サイドバーが約 0.25 秒かけて畳まれる。そのあいだに一覧の幅が 768 → 936px に広がり、カードの字の折り返しが減って、ボタンより上のまとまりが少しずつ低くなる(一覧の高さ 5936 → 5721)。
- `restoreScroll` は戻した直後に 1 回だけ、ボタンが外に出ていれば `scrollIntoView({block:'nearest'})` で**下の端ぎりぎり**に置く。そのあとは見ていない。一覧の高さが変わるあいだ、ブラウザのスクロールの錨(scroll anchoring)がボタンの位置をほぼ保つが、スクロール位置は整数に丸められるため、1px 未満のずれが残る。端ぎりぎりに置いているので、ずれが外向きなら画面の外に出る。
- ブランチで毎回外向きになるのは、fix-1 の行の高さ(`.dojo-builtin-degrees` を 1.3 = 16.9px)でカードの位置に端数(.9 など)が付き、残るずれが +0.17px になるため。master は 17px 行で、ずれがたまたま内向き(-0.44px)だった。つまり、見立て(行の高さの直しで一覧の形が変わった/1 回だけ戻して端ぎりぎりに置く/そのあと一覧の高さが動く)は合っていた。一覧の高さを動かしているのはサイドバーが畳まれる動き。master でも端ぎりぎりに置いていて、通るかどうかは端数しだいだった。

### 2. 直したこと

直したのはアプリのコードだけ。テストの期待・待ち時間・retry・skip は変えていない。Jazz のカードの高さは fix-1 のまま(16.9px の行)。

- `src/views/chord-dojo/scrollRestore.ts`:
  - `bringIntoView`(新しい内部の関数):ボタンが箱から少しでも外に出ていれば `scrollIntoView({block:'nearest'})` で入れ、それでも整数に丸めたせいで 1px 未満はみ出していれば、はみ出した分を切り上げてもう一度スクロールする。
  - `restoreScroll`:前と同じように位置を戻してボタンを入れたあと、**1 秒間(`SETTLE_MS`)**、一覧の中身(スクロールする箱の子)の大きさの変化を `ResizeObserver` で見て、変わるたびに `bringIntoView` する。利用者がホイール・ポインター・キー・タッチを使ったら、そこで見るのをやめる。見るのをやめる関数を返す。
- `src/views/chord-dojo/ChordDojoView.tsx`(戻す所の `useEffect`):`restoreScroll` が返す関数を持っておき、片付けのときに呼ぶ。
- `src/views/chord-dojo/scrollRestore.test.ts`(新しい単体テスト、4 件):(1) 丸めで端数が外に残ってもボタンが全部中に入る (2) 戻したあとに一覧の高さが変わってボタンが外に出たら、中に入れ直す (3) ホイール・キー・時間切れで見るのをやめる (4) 中にあるボタンは動かさない。

### 3. 確かめたこと(どれも 1 つずつ、ほかを同時に動かさずに回した)

- `e2e/dojo-list-scroll.spec.ts` を 5 回続けて回した:5 回とも PASS(各回 14/14)。
- 1 回ずつ:`e2e/p22-01-list.spec.ts` PASS(13/13)、`e2e/p12-3-dojo.spec.ts` PASS(33/33)、`e2e/p12-4-progressions.spec.ts` PASS(4/4)、`e2e/jazz-progressions.spec.ts` PASS(39/39)、`e2e/visual.spec.ts` PASS(6/6。基準の写真は変わらない)。
- heavy の 6 本(preview-fade・dojo-display-judge・p12-master251-register・p12-master251-ui-scheduler・vl-14-resume-smooth・phase13-1-bass-ui)をワーカー 2 で 1 回:PASS(53/53、4.3 分)。
- 単体テスト `src/views/chord-dojo/scrollRestore.test.ts`:PASS(4/4)。
- `npm run lint`:PASS。`npm run build`:PASS。
- `npm test`:**FAIL(576 ファイル中 4 失敗・570 通過・2 飛ばし。6489 件中 4 失敗・6483 通過・2 飛ばし)**。落ちたのは次の 4 件で、どれも `Test timed out in 5000ms`(期待した値の違いではない):
  - `scripts/p7/modularTournament.test.ts`「is deterministic on the public synthetic Gold suite …」
  - `scripts/p7/sealedFinal.test.ts`「reports only aggregate, category, and paired summaries …」
  - `src/domain/earPractice/earPractice.test.ts`「3: the bass is the lowest note (C2…B2) …」
  - `src/domain/master251/fixedProfileUi.test.tsx`「real Master View consumes all48 Form fixed profiles …」

  `npm test` は `vitest run` のままで、1 件あたりの時間が 5 秒(FULL の Vitest は `--testTimeout=30000` で、FULL の 2 回目・3 回目ではこの 4 件も通っている)。同じ形で 2 回回して 2 回とも同じ 4 件が落ちた。**master(`dfdff787`)で `npm test` を回しても同じ 4 件が同じ形で落ちた**ので、この枝の変更とは関係なく、`npm test` の 5 秒の時間切れで前から落ちる物と考える。直していない。

ログ:`<作業フォルダ>/claude-scratch/p2304/fix2/`(リポジトリの外)。
