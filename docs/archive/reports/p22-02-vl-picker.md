# P22-02: Voicing Loop の選ぶ画面

- ブランチ: `feat/p22-02-vl-picker`(コミット `fda71eb4`、この報告のコミット)
- **ベース**: `master` にはまだ P22-01 が入っていませんでした(`master` = `6c28baaa`、P22-01 は `feat/p22-01-chord-dojo` の `ceee1d8e`)。指示の「master(P22-01 入り)から」に合わせて、**P22-01 のブランチの先端(`ceee1d8e` = master + P22-01)から**このブランチを作りました。master は触っていません。

## 0. 今の画面・場所・今のテスト

- 一覧は `src/views/ProgressionVoicingPracticeView.tsx` の `if (!progressionsLoaded)` の中(進行を読み込むと練習画面に変わる)。**触った行**: `5`(import の追加)・`126`(props)・`244〜248`(文言)・`289`(引数)・`1375〜1439`(一覧)・`2431〜2505`(`ProgressionChoice` と理由の関数)。**それ以外(練習画面)は 1 行も変えていません**。
- 見た目は `src/styles/voicing-loop.css`。このファイルは 101 行で、もとは練習画面の container query だけでした。**末尾に `@layer components` を 45 行追加**(`lv-vl-picker-*`)。練習画面の決まり(`lv-vl-controls`・`lv-vl-current-panel`・`lv-vl-transport` など)は触っていません。
- 今の e2e・単体が一覧について確かめていること(**全部残しました**):
  - `e2e/vl-15-progression-picker.spec.ts`:3 つの節(お気に入り・最近使った・そのほか)と 5 行。行の高さ ≤64、♥ 32×32 でタイトルの前、タイトルの領域が「練習する」の前、コードの行は折り返さない・切る・高さ ≤20。4 行に「練習する」(≥28×28)、練習できない 1 行には無い。仮の BPM は数字だけ・薄い・説明は `title`。検索は「検索結果」。♥ は Vault のお気に入りを書き、開き直すまで並びは動かない。Vault 側の並びは変わらない。
  - `e2e/phase5.28-voicing-loop-navigation.spec.ts`:見出し「練習する進行」・検索欄・空の表示の文・「テキストで新しい進行を入力」(クリックと Enter)・行を Enter で開くと練習画面・最近使ったが 1 回だけ記録・axe/zoom/横はみ出し。
  - `e2e/phase5.30-voicing-loop-polish.spec.ts`・`e2e/phase5.31-control-timing.spec.ts`:「テキストで新しい進行を入力」と行から練習画面を開いて、タイミングの確かめをする。
  - `e2e/voicing-loop-v2.spec.ts`:見出し(h2)・3 行のうち 2 行が使える・仮の BPM の文字と `title`・容量の行の短い理由・200% で横にはみ出さない。
  - `src/views/ProgressionVoicingPracticeView.test.tsx`:一覧の行数・検索・空の表示・お気に入りの案内と失敗・♥ の追加/削除・行と ♥ の押し分け・練習できない行と理由・仮の BPM・並び順・行から練習画面へ。
- 写真(変える前):`p89-generated/p22-02-vl-picker/before/` に 5 つの状態 × 5 つのサイズ(下の「写真」)。

## 1. 直したこと

1. **見出しを小さく**:「練習する進行」「お気に入り」「最近使った」「そのほか(新しく保存した順)」「検索結果」を `.lv-vl-picker-title`(14px = `--lv-font-sm`・700・`--lv-text-secondary`)に。**件数は見出しのすぐ右**(今までは行の右端)。`ProgressionVoicingPracticeView.tsx`・`src/styles/voicing-loop.css`。
2. **検索の枠**:`lv-field-control` を使い、高さ 40px(`--lv-control-md`)。フォーカスの枠は `--lv-focus` の 2px に(太いアクセントの光る枠をやめた)。
   - 注:「開いたときに検索へフォーカスする」動きは今の実装に**ありませんでした**(開いたときのフォーカスは `#main-content`)。無い動きは足していません。
3. **行全体を押せる**:行は `div`(入れ物)。主の操作は「練習する」ボタン(`data-testid="voicing-loop-progression-practice"`。**文言・アクセシブルネームは「練習する」のまま**)で、`::after` を行いっぱいに広げた。♥ は `z-index: 2` で上に出し、押しても行は開かない。
   - 色:ふだんは枠だけ。**マウスを乗せた行**と**キーボードが入っている行**(`:focus-within`)のボタンだけ塗りの緑。
   - 補足(実装の都合):クリックのたびに `prepareAudio`(pointerdown)で再描画が走り、その一瞬だけ `::after` の当たり判定が外れて `click` が行に落ちることがありました(`mouseup` の相手が中の文字になっていた)。そこで**行そのものにも onClick** を置き、ボタン側は `stopPropagation` で二重にしないようにしました。e2e で「1 回だけ」を最近使った記録の書き込み数(1 回)で確かめています。
4. **キー・BPM・小節数**:タイトルの右に 3 つの小さな四角いラベル(`.lv-vl-picker-tags`)。キーは今ある `displayKey()`(既存の日本語の形)で「F#メジャー」。既存の形は ASCII の `#` と空白なしなので、それに合わせました(見本の「F♯ メジャー」とは字形が違います)。
5. **「テキストで新しい進行を入力」を右上へ**:検索の右に枠だけのボタンとして置いた。一番下のものは削除。押したときの動きは今のまま。
6. **練習できない進行**:行を薄くし(`opacity: .55`)、**理由をコードの行の所に 1 行**で出す。容量(練習グループ数が 256 超)の文は指示どおり「長すぎるため、ここでは練習できません(範囲を分けて保存してください)」。ほかの理由は今までの短い文のまま。行に `aria-disabled="true"`、ボタンは出さない(押しても何も起きない)。全文は理由の行の `title` に残した。
7. **0 件のとき**:「まだ進行がありません」+「MIDI から取り込む」(取り込む画面へ)+「テキストで入力」。説明文も「「MIDI から取り込む」で MIDI を読み込むか、テキストで進行を作ってください。」にそろえた。
8. **戻るボタン**:この一覧から練習画面へ戻るボタンは**無い**ので、足していません(§1-8 の「なければ、足さない」)。したがって `.dojo-back` を `components.css` へ移す作業もしていません。P22-01 の戻るボタンのテスト(`e2e/p22-01-back.spec.ts`)はそのまま通ります。

## 2. 変えていないこと

- 並び順(お気に入り → 最近使った → そのほか)、検索の当たり方、お気に入りの保存、キーボードの操作(Enter)、行の中のコードの並び(「→」)と機能の色を付けないこと。
- 練習画面(進行を選んだ後)は 1 行も変えていません。

## 3. テスト

### A(探し方の直し)

| ファイル・テスト | 前 | 後 |
|---|---|---|
| `e2e/phase5.28-…「P5.28 Text handoff…」` | 行を `voicing-loop-progression-choice`(ボタン)で探し、focus + Enter / click | 行の中の `voicing-loop-progression-practice`(「練習する」)で focus + Enter / click |
| `e2e/phase5.31-…`(2 つの入力) | 同上(choice を focus + Enter) | 同上(練習するを focus + Enter) |
| `e2e/voicing-loop-v2「VL-07 selector clipping…」` | choice を `toBeEnabled()` | 行の「練習する」を `toBeEnabled()` |
| `src/views/ProgressionVoicingPracticeView.test.tsx`(4 か所) | choice の `click()` | 練習するボタンの `click()` |
| 同上(4 か所) | choice の `disabled` | 行の `aria-disabled` と「練習する」ボタンの有無 |

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| `phase5.28`・単体:空の表示の文「練習できる保存済み進行はまだありません。」 | 「まだ進行がありません」+「MIDI から取り込む」「テキストで入力」の 2 つ(単体は文、`p22-02` は 2 つのボタンと行き先) | §1-7 |
| `voicing-loop-v2`・単体:練習できない行の短い理由に「256」が入る | コードの行に「長すぎるため、ここでは練習できません(範囲を分けて保存してください)」。全文(256 を含む)はその行の `title` に残る | §1-6 |
| (押していたテストは無し)行の「タイトル」ボタンで開く | 行の主の操作は「練習する」ボタン。行をクリック・Enter・Space で 1 回だけ開くことを `p22-02` で確かめる | §1-3 |

### 足した e2e(`e2e/p22-02-vl-picker.spec.ts`、10 件)

- 行をクリック / Enter / Space で開くと練習画面が 1 回だけ開く(最近使った記録の書き込みが 1 回)。
- ♥ をクリック / Enter / Space で動かしても開かない(お気に入りは切り替わる)。
- 右上のボタンが検索の右にあり、押すとテキスト入力が開く。
- 練習できない行は `aria-disabled` でボタンが無く、押しても何も起きない。
- ふだんは枠だけ、行に乗せたとき・キーボードが入ったときだけボタンが塗り。
- 節の見出しが 14px/700/二次色で、件数がすぐ右。検索は 40px でフォーカスの枠が `--lv-focus`。キー・BPM・小節数の 3 つのラベル。
- 0 件の表示と、2 つのボタンの行き先(取り込む / テキスト)。
- 5 つのサイズ(1280×720・1366×768・1440×900・1920×1080・768×640)で横にはみ出さない。

## 写真

`p89-generated/p22-02-vl-picker/`(git では追跡しない)

- 変える前: `before/{favorites,no-favorites,search,empty,unavailable}-{1280x720,1366x768,1440x900,1920x1080,768x640}.png`
- 変えた後: `after/` に同じ 25 枚。
  - お気に入りあり=`vl15-picker` の見本データ、なし=`selector-vl07`、検索中=「Public」で絞った所、0 件=空のアプリ、練習できない行=`selector-vl07`。

## 見た目の基準

`e2e/visual.spec.ts-snapshots/` の 8 枚(Voicing Loop の選ぶ画面は写っていない。`practice.png` は Chord Dojo の練習画面)なので、**更新していません**。

## 指示どおりにできなかった所・注意

- **ブランチのベース**が master ではなく P22-01 のブランチの先端(上に書いたとおり master に P22-01 が入っていないため)。P22-01 を master に入れてから P22-02 をマージすれば、同じ内容になります。
- 「開いたときに検索へフォーカスする」動きは今の実装に無いため、足していません。
- キーの日本語は既存の `displayKey()`(「F#メジャー」)。見本の「F♯ メジャー」とは `#` の字形と空白が違います。
- 練習できない理由の文は、容量のときだけ指示の文。ほかの理由(`資源の上限`・`拍子`・`BPM`・`キー`・`コード`)は今までの短い文のまま。
- 行の押下は、`::after` に加えて行そのものの `onClick` でも受けています(クリック中の再描画で `::after` の当たり判定が外れるため)。二重には開かないことを e2e で確かめています。

## FULL

`npm run test:full` を **1 回**回して、**PASS**(`fda71eb4`,2026-11-10 22:11〜22:28・**875.5 秒**)。落ちた回はありません。

- Vitest full: **6378 / 6380 PASS**(2 skipped)
- Playwright full: **921 / 923 PASS**(2 は既存の条件付き skip)
- Playwright heavy pass: **53 / 53 PASS**
- ほか: Source contracts・AI handoff・Class lint・Phase docs・Runner contracts 40/40・Privacy scan・E2E TypeScript・Production build・Repository ESLint・App TypeScript・Gallery excluded・Git diff check・Tracked PNG check すべで PASS
- `goto の開き直り 0 回`

回した FULL はこの 1 回だけです(落ちた回は無し)。
