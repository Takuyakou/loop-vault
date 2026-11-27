# VL-15: Voicing Loop の「練習する進行」を見やすくする/お気に入りを上に

ブランチ `feat/vl-15-progression-picker`(master `8fd37477` から)。**master へのマージ・push はしていません。** 仕様 `VL-15-progression-picker.md`。確かめはすべて合成データ(e2e の fixture と、e2e がテキスト入力から作る進行)だけで行い、実際の Vault は読み書きしていません。

## 0. 変えたもの(まとめ)

| ファイル | 変更 |
|---|---|
| `src/domain/progressionVoicingPractice/library.ts` | 候補に `favorite`(=`block.pinned ?? false`)と `lengthBars` を追加。段の分け方 `groupVoicingLoopVaultCandidates`、検索中の並び `arrangeVoicingLoopSearchResults` を純粋関数として追加 |
| `src/views/ProgressionVoicingPracticeView.tsx` | 進行を選ぶ前の画面を作り直し(見出し・段・2行の行・お気に入り・検索・BPM表記)。`onToggleFavorite` を追加 |
| `src/App.tsx` | `onToggleFavorite` を Vault と同じ `updateProgressionBlock(ideaId, blockId, { pinned })` につないだ |
| `src/testing/progressionVoicingPracticeE2eFixture.ts` | 合成の `vl15-picker` を追加(お気に入り2・最近1・そのほか・練習不可1)。候補の `id` を `voicingLoopSourceId` と同じ形に |
| `e2e/vl-15-progression-picker.spec.ts` | 新規 2 件(大きさ・行の形 / お気に入りの往復) |
| `e2e/phase5.28・5.30・5.31`・`e2e/voicing-loop-v2.spec.ts` | 仕様で変えた文言・見出し・BPM 表記に合わせて期待を置き換え(§3) |
| `src/domain/progressionVoicingPractice/library.test.ts`・`src/views/ProgressionVoicingPracticeView.test.tsx` | 単体を追加(6 + 4 件)し、置き換えた確かめを §3 に記載 |

## 1. 画面(§1)

### 見出し
- 進行を選ぶ前の `SectionHeading kicker="PRACTICE" title="Voicing Loop" description=…` を**出さない**ようにしました(上のバーの「Voicing Loop」と重なるため)。進行を選んだあとの画面は変えていません。
- 「練習する進行」と検索欄を同じ行に。幅が足りないとき(おおよそ 900px 未満)は検索欄が下の行へ回ります。
- 説明文「My Vaultの保存済み進行を選ぶと…」は削除。代わりに**お気に入りが0件のときだけ**「(星の絵)を押すと、お気に入りが一番上に並びます」を小さく出します。

### 段と並び
- 段は **お気に入り → 最近使った → そのほか(新しく保存した順)**。同じ進行は1つの段にだけ出ます(お気に入り優先)。最近使ったは、お気に入りを除いた**最初の3件**(保存件数 `MAX_RECENT_VOICING_LOOP_PROGRESSIONS = 5` は不変)。件数0の段は見出しごと出しません。各段の見出しの右に件数。
- **最初から全部**並べます。「すべての進行を見る」ボタンと `showAllProgressions` は削除。
- 練習できない進行は自分の段の中に薄く出し、「練習する」の代わりに**短い理由**(今の文の最初の1文。全文はツールチップ)を出します。星は付けられます。
- 検索中は段を分けず「検索結果」の1段にし、**お気に入り → 最近使った → そのほか** の順。星の印はそのまま。

### お気に入り(☆)
- **Vault と同じ `pinned`**。新しい保存場所は作っていません。Vault で付けた進行は Voicing Loop でも付いており、Voicing Loop で付けると Vault でも付きます。
- 押した瞬間は**星の表示だけ**変え、**並びは変えません**(押した行が動くと押しまちがいやすいため)。並び直しは「次にこの画面を開いたとき」と「検索の文字を変えたとき」。実装は、画面を開いた時点(と検索語を変えた時点)の候補を `useRef` に凍結し、星の表示だけ live な値(`favorite` と楽観的な上書き)から描く形にしました。
- 保存に失敗したら表示を元に戻し、「お気に入りを保存できませんでした。」を出します。**押しても練習は始まりません**。
- 実装上の判断:仕様の「短いお知らせ」は**行の上の1行**(`role="status"`)にしました。この画面は通知プロバイダーの外でも描ける(単体テスト)ため、トースト依存を増やさないためです。

### 1件の形(2行)
- 1行目:星(32×32)・タイトル(1行、末尾「…」、`title` で全文)・キー/BPM/小節数・「練習する」。2行目:コード(1行、末尾「…」、`title` で全文)。
- BPM は**数字だけ**。「SMF既定」「練習初期値」の文字は出しません。保存された値でないときは**薄く**し、マウスを乗せると「MIDIにテンポが無いため、120 BPM で始めます」/「BPMが保存されていないため、120 BPM で始めます」。`data-tempo-origin` は残しています。
- 行のどこを押しても練習が始まります(星を除く)。キーボードでは星と「練習する」の2つに Tab で届きます。
- 1行の高さは実測 **48px**(仕様の目安 64px 以下)。
- 「＋ テキストで新しい進行を入力」に文言変更。

## 2. 単体テスト(§3)

### 2.1 新しく足したもの

- `library.test.ts`(6件):お気に入り/小節数を候補に読む・無ければ作らない・段の分け方(お気に入りが上/重複しない/最近は3件まで/そのほかは新しい順)・空の段を出さない・練習できない進行も自分の段・検索中の並び。
- `ProgressionVoicingPracticeView.test.tsx`(4件):星を押すと `updateProgressionBlock` 相当のコールバックが `(reference, true)` で呼ばれ表示が変わり**並びは変わらない**・開き直すと一番上・保存失敗で戻る+お知らせ・星では練習が始まらず行では始まる・お気に入り0件のときだけ一言。

## 3. 置き換えた確かめ(理由つき)

仕様で画面の言葉・構造が変わったための置き換えです。**期待を弱めたものはありません**(同じことを新しい構造で確かめています)。

| ファイル・確かめ | 前 | 後 | 理由 |
|---|---|---|---|
| `ProgressionVoicingPracticeView.test.tsx`「inline source-less Vault list」 | `h2` = "Voicing Loop" | `h2` = "練習する進行" | 重複見出しを仕様どおり削除したため |
| 同「searches… expands in place」 | 5件表示 → 「すべての進行を見る」で6件 | 最初から6件・「すべての進行を見る」が無い | 展開ボタンを削除したため |
| 同「SMF default and practice initial BPM」 | 「120 BPM（SMF既定）」「120 BPM（練習初期値）」 | 数字のみ+薄い+`title` の説明 | 仕様で文字を出さないため(§1) |
| 同 練習不可の2件 | 理由をボタンの `textContent` で確認 | 行(`voicing-loop-progression-row`)の文字で確認 | 理由を「練習する」の位置へ移したため |
| `phase5.28` ヘルパー | 見出し "Voicing Loop" が visible | 見出し "練習する進行" が visible | 同上 |
| `phase5.28` 2か所 | 見出し "最近使った進行" | "最近使った" | 段の名前を仕様どおりにしたため |
| `phase5.28`・`phase5.30`・`phase5.31` | `/Textで新しい進行を入力/` | `/テキストで新しい進行を入力/` | 文言変更 |
| `voicing-loop-v2` 2か所 | `h2` "Voicing Loop" | `h2` "練習する進行" | 同上 |
| `voicing-loop-v2` 1か所 | 「120 BPM（練習初期値）」 | 「120 BPM」+`title` | 同上 |
| `voicing-loop-v2` 1か所 | 練習不可の理由をボタン内で確認 | 行の文字で確認 | 同上 |

## 4. 写真(追跡しない `p89-generated/vl-15/`)

合成データのみ。1440×900 を基本に、1280×720 も撮っています。

| ファイル | 内容 |
|---|---|
| `p89-generated/vl-15/picker-1440x900.png` | お気に入りあり(お気に入り・最近使った・そのほか) |
| `p89-generated/vl-15/picker-search-1440x900.png` | 検索中(「検索結果」の1段) |
| `p89-generated/vl-15/picker-1280x720.png` | 1280×720 |
| `p89-generated/vl-15/picker-favorite-1440x900.png` | 星を付けて開き直した状態 |
| `p89-generated/vl-15/picker-no-favorite-1440x900.png` | お気に入り0件(一言が出る) |

## 5. 確かめ(§3)

| 対象 | 結果 |
|---|---|
| 単体(全体、FULL と同じ `--maxWorkers=4 --testTimeout=30000`) | **6,281 passed / 2 skipped(6,283)**(VL-15 で +10) |
| e2e(関係する5本:phase5.28・5.30・5.31・voicing-loop-v2・vl-15) | **25/25 PASS** |
| e2e `vl-15-progression-picker.spec.ts` 単体 | **2/2 PASS** |
| `npm run typecheck:e2e`・`npm run lint` | PASS |
| `npm run test:full`(1回目) | **FAIL** — 既存の `p12-dojo-home-layout.spec.ts`(1297×1040)が 1 件。ボタンの高さ 26px < 44px(§5.2) |
| `npm run test:full`(2回目) | **PASS — 947.1s**(Vitest 6,281/6,283(既存スキップ2)・Playwright 主パス 802/804(既存/条件付きスキップ2)・heavy 47/47・`goto` の開き直り 0 回・Git 差分チェック PASS・追跡 PNG 変化なし)。ログ `.local-evaluation/test-logs/2026-11-07T07-14-45-362Z-full.log` |

### 5.1 e2e が見ていること

- `VL-15 picker rows stay compact…`:1280×720・1440×900・1920×1080 の3つで、段が出る・行は5件・**行の高さ ≤64px**(実測48)・星 32×32・星→行→操作の順で重ならない・コードは1行(`nowrap` + `overflow:hidden`)・練習ボタンは4行にあり28px以上・練習不可の行は操作なし・BPM は数字だけ+薄い+`title`・横のはみ出しなし。
- `VL-15 star writes the Vault favourite…`:合成の2進行を作り、Vault の並びを記録 → Voicing Loop で星 → **その場では並びが変わらない** → 開き直すと「お気に入り」の段の先頭 → Vault の一覧でも星が付いており**並びは変わらない** → Vault で星を外すと Voicing Loop でも外れる。

### 5.2 FULL 1 回目で出た `p12-dojo-home-layout` の 1 件

- **出たもの**:`Dojo home 1297x1040 prioritizes lesson and all practice entries` の1件。`expect(r.height).toBeGreaterThanOrEqual(44)` に対し **26px**。Dojo ホームのレイアウト計測で、**VL-15 が触っていない画面**(`src/views/chord-dojo/`)です。
- **切り分け**:同じ spec を単体で走らせると **6/6 PASS**(52.7s)。2 回目の FULL では **802/804 PASS** に含まれて通過。1 回目の FULL のログでだけ出た**負荷依存の1回**と判断しました。
- **扱い**:期待値・待ち方・振り分けは**変えていません**(R-01 の方針どおり、1 回の再現でテストを書き換えない)。再現が続くようなら、R-01 の「計測系は低並列パス」に追加するのが次の候補です。

## 6. 注意

- e2e の `?p527Status` を使わない経路(`/`)では、Playwright 用ビルドが常に既定の Voicing Loop 練習を1つ持つため、**進行を選ぶ前の画面**を見るときは `?p528Direct=1` が必要です(既存の phase5.28 と同じ)。新しい e2e もそれに合わせています。
- 合成 fixture の候補 `id` は `voicingLoopSourceId`(=`JSON.stringify([ideaId, blockId])`)と同じ形にしました。最近使ったの照合がこの id で行われるためです。

## 7. ここで止まる

master へのマージ・push はしない(利用者の確認待ち)。
