# Jazz-00: 調査報告(コードは変えていません)

ブランチ `audit/jazz-00`(master `95aa2fa6` から。この報告だけをコミット)。push・マージ・タグはしていません。
P12.5 を master に入れる試験は、捨て用のブランチ `trial/jazz-00-p125-merge`(1コミット `083cd6ef`)で行いました。**このブランチはどこにもマージしません**(要らなければ利用者が消してください)。
製品のコード・データ・記録の中身は、master のまま変えていません(データの確認に使った一時ファイルは実行後に消してあります)。
推奨ボイシング(元の演奏の書き起こしではない)の表は、手元の `jazz-progressions-sheet.md` と `data/jazz-progressions.json` を見て確かめました。

## 0. 結論(先に)

| 問い | 答え |
|---|---|
| データは今のアプリで読めて判定に通るか | **通る。** 56枚すべて(`core`・`shape` の両方)。`check_jazz.py` は `errors: 0`(Windows では `python -X utf8` が要る。§4) |
| P12.5 を master に入れられるか | **入れられる。** 食い違いは5ファイル(小さい)。ただし **見えない食い違いが1つ**あり(Rust の保存先の確認。§1.2)、直さないと耳で弾くの記録が保存できなくなる。直したうえで、型・lint・Vitest・Rust は通り、e2e は 694 通過・2 不合格(その2本は単独で再実行すると通過。§1.5) |
| P13.1 の FULL 不合格 | **今の master では再現しなかった**(10回中10回通過)。原因は未特定のまま(§1.3) |
| 載せ方 | **B(P12.5 の仕組み)をすすめる。** 記録は **Jazz 専用の別の置き場所**、画面は **共通の部分を分けて**、Original と Jazz の両方から使う(§2.0・§2.1・§2.2・§2.4) |
| 利用者の判断が要る点 | §6 に6つ |

## 1. P12.5 を master に入れられるか(実際にはマージしていません)

### 1.1 食い違いの一覧と直し方

`git merge-tree` で P12.5(`cb2d1b95`)と master を突き合わせ、続けて捨て用ブランチで実際に合わせて確かめました。**文字として食い違うのは5ファイル**です。`session.ts`・`store.ts`・`longProgression.ts`・`chord-dojo.css`・`BuiltinProgressionList.tsx`・`e2e/p12-chord-dojo.spec.ts` ほかは自動で合いました(食い違いなし)。

| ファイル | 中身 | 直し方(捨て用ブランチでやったこと) |
|---|---|---|
| `scripts/p89/playwright.p89.config.ts` | 1行の `testMatch` の連なり。master は先頭に `P15` を足し、P12.5 は先頭に `P12.5` を足した | 両方残す(`P12.5` → `P15` → 今までの順)。1行 |
| `src/views/chord-dojo/dojoNav.ts` | 画面の種類の一覧。master は `'ear'`、P12.5 は `'original'` を足した | 両方足す(`'ear'\|'original'`)。1行 |
| `src/features/bass-practice/infra/repository/practiceStorage.ts`(5か所) | master は置き場所の名前を表にまとめ直した(`PracticeNamespace`・`NAMESPACE_APP`・`VERSION_ONE_APPS`)。P12.5 は同じ所に `original-practice` を直接書いた | **master の形を採り**、3つの表に `original-practice` / `loopvault-original-practice` を足す。P12.5 の入れ物の名前(`loop-vault:original-practice-v1:`)は master の組み立てと同じになる |
| `src-tauri/src/practice_storage.rs`(4か所) | ① 置き場所の分岐(`ear-practice` と `original-practice`)② 「記録の入れ物」の判定(`validate_document`)③ 戻すときの版(`with_current_version_and_revision`)④ テスト2つが隣り合う | ① 両方の枝を残す ② ③ master の `matches!` に `loopvault-original-practice` を足す(P12.5 の別の変数 `original` は要らなくなる)④ テスト2つとも残す |
| `src/views/chord-dojo/ChordDojoView.tsx`(3か所) | 1行が非常に長い所(画面の状態・キー入力の除外・一覧とカードの描画)。行としては衝突するが、**中で食い違うのは画面の種類 `'ear'` と `'original'` の2か所だけ** | 行ではなく **記号の区切り(`< > ( ) { } , ;`)ごとに分けて3者マージ**すると、本当の衝突は2つ(画面の種類の一覧・キー入力の除外)だけになる。どちらも両方足す。残りの P12.5 の追加(`originalCfg`・`lapRef` の印・`OriginalPracticeView` の呼び出し)は自動で入った |

**やり方の記録**(Stage 01 でそのまま使えます):捨て用ブランチの合わせ方は `git merge`(押し戻し・`rebase` はしない)。ChordDojoView は、3つの版(合流の元・master・P12.5)を記号の区切りで改行に分け、`git merge-file` でマージし、区切りの目印を取り除いて元に戻す。

### 1.2 食い違いとして出ない、壊れる所(重要)

P12.5 は `save_document_unlocked_with_fault`(`practice_storage.rs`)の「書く入れ物の `app` が、そのファイルの持ち主か」の確認を、ファイル名ごとの分岐に書き換えています。master はこの行に触っていないので、**文字としては衝突せず、自動で P12.5 の行が入ります。**
その分岐は `bass-midi-library-v1.json`・`original-practice-v1.json`・それ以外(= 通常の練習)しか知りません。**P16 の `ear-practice-v1.json` は「それ以外」に落ち、`loopvault-practice` を求められて、耳で弾くの記録の保存が `namespace envelope mismatch` で全部失敗します。**

- 確かめ:衝突を文字だけ直した段階で `cargo test practice_storage` を走らせると、**P16 のテスト `ear_practice_is_isolated_and_keeps_version_one_on_restore` が不合格(15 通過・1 不合格)**。
- ブラウザ(localStorage)の経路ではこの確認が無いため、**e2e では見つからない**。実機(Tauri)でだけ起きる。Rust のテストで見つけるしかない。
- 直し方:ファイル名で4つ(通常・ベースのライブラリ・耳で弾く・Original)を決める `match` にする(数行)。直したあとは **16/16 通過**。
- Stage 01 では **`cargo test` が必須**(Stage 01 の指示書にはすでに入っています)。Jazz の記録を別の置き場所にする場合(§2.4)は、ここにもう1行足すことになります。

### 1.3 P13.1 の FULL 不合格

P12.5 の最終報告(`P12.5-final-hardening.md`)の唯一の不合格は `e2e/phase13-1-bass-ui.spec.ts` の「P13.1 §1 §10 result without scroll and primary actions 1920」(期待 `余分な音 1`、実際 `余分な音 2`)で、その報告は **当時の master `7a3d432a` でも 10 回中 2 回落ちる**と書いていました。

- **今の master(`95aa2fa6`)で、同じテストを10回(worker 2・retry なし)走らせた結果は 10 回中 10 回通過**。
- **P12.5 を合わせた捨て用ブランチでも 10 回中 10 回通過。**
- 結論:今の master では再現しない。ただし原因(合成録音の「余分な音」の数え方)は特定されていないので、**直ったとは言わない**。Stage 01 の FULL で出たら、そのテストだけを10回走らせて、master と同じかを確かめる。P12.5 の変更とは関係が無い(ベースの録音・解析に P12.5 は触っていない)。

### 1.4 P12.5-01 を一緒に入れてよいか(利用者の判断)

P12.5-01 は Jazz と関係ありませんが、P12.5 と一緒に入ります。今の Dojo の動きが**見える形で**変わります。どれも P12.5 のときに利用者が決めたものです(`P12.5-00-decisions`)。

1. 「見て弾く」「覚えて弾く」で、ヒント・答えを見ても最初に戻らず、その場で弾き直して続ける(ヒントを見た周はクリアにしない。記録は今のまま)。カードに「ミス/前回ヒント/前回ミス」の小さな印(表示だけ)
2. ランダムキーから外す条件が「8小節以上」から「コード数 9 以上」に変わる。**カノン進行(8コード)はランダムキーに戻り**、外れるのはジャズブルース・マイナーブルース・リズムチェンジ A の3件
3. 上の変更に合わせて、既存の e2e 4本と単体テスト1本の期待が書き換えられている

**判断してほしい点**:P12.5 の実機の確認(周回・2枚目の E♭maj9・移調の端・お手本の響き。P12.5 報告 §6)は**まだ**です。Jazz の「押さえたまま」の判定は同じ仕組み(`HeldCardJudge`)なので、**Stage 01 の統合ブランチで、利用者が Original Practice を実機で1周弾いてから**、Jazz を載せるのが安全です。

### 1.5 試験統合の確かめ

捨て用ブランチ(P12.5 を合わせ、§1.1 の直しと §1.2 の直しを入れたもの)で:

| 確かめ | 結果 |
|---|---|
| 型(アプリ・e2e) | 通過 |
| ESLint(触った範囲) | 通過 |
| Vitest(定番の進行・練習・耳で弾く・保存・画面) | 55 ファイル / 1014 件通過(skip 2) |
| `cargo test practice_storage` | 文字だけ直した段階 **15/16(P16 が不合格)** → §1.2 の直しのあと **16/16** |
| `cargo test --lib` 全体 | 68/68 通過 |
| e2e(`test:ui` に P12.5・定番の進行・耳で弾くの13本を指定。選択が自動で広がり、結果は下) | **694 通過・2 不合格・2 skip**。不合格は `p12-master251-register.spec.ts:196` と `p12-master251-ui-scheduler.spec.ts:106`(5 秒の待ちの超過)。**この2本を単独で再実行すると 8/8(A〜D)通過**。長い実行の中での時間切れで、P12.5 の変更とは関係が無いと見る(この2本を素の master の長い実行で走らせてはいない)。所要は 6.7 時間と表示(この間 PC が止まっていた可能性。原因は調べていない) |
| P12.5 の e2e(Original・ヒントで戻らない)・P16 の e2e(耳で弾く・記録・楽譜・度数) | 上の 694 の中で通過 |

FULL(`npm run test:full`)は Stage 00 では走らせていません(Stage 01 の仕事)。

## 2. Jazz を載せる道筋

### 2.0 載せ方の比較

| 比べる点 | A. 今の定番の進行の仕組み | B. P12.5 Original Practice の仕組み | C. 組み合わせ(一覧・記録・復習は A、判定と見本は B) |
|---|---|---|---|
| ① 決まった音を見本と判定に | **できない。** `buildBuiltin(id,key)`(`builtins.ts`)は `DEFS` の根音・種類・テンションから `rotations()` で音を作り、動きの少ない並びを選ぶ。データの音(左右の手・オクターブ)をそのまま使う口が無い。判定 `judgeChord`(`judging.ts`)の `core` は音名の集合で、`shape` は上の並びと音域の広がり。`exact` は音の高さまで求めるが**余分な音を間違いにする**。「ほかの音は無視」にできない(`judgeChord` は変えない約束) | **できる。** `OriginalCard` の `expected`・`struck`・`carried`・`left`・`right` が決まった音。`HeldCardJudge`(`heldCardJudge.ts`)が「全部押さえている + `struck` は押し直した」を見て、余分な音は無視 | B と同じ |
| ② 押さえたまま・押し直し | できない(`ChordEntry` は集合が揃うまで待つ作り) | **できる。** `HeldCardJudge` の `held` と `fresh` | B と同じ |
| ③ 指番号 | 今の指(`dojoFingerings` = 運指の探索)は計算で決まる。データの指は入れられない | `targetSnapshot(..., plan.labels)` に `Map<MIDI,'L5'\|'R1'>` を渡せば `snapshotFingerLabels` が鍵盤に出す(P12.5 は `labels` を渡していないので今は指が出ない)。**データの指で 282 音すべて一致することを確かめた(0件の食い違い)** | B と同じ |
| ④ あとで12キー | `buildBuiltin(id,key)` は移調できるが、データの固定の音には使えない | `shift` で平行に動かせる(Original がそうしている)。記録は進行×主音(`laps[id][tonic]`)で、そのまま12キーに伸ばせる。黒鍵で指が変わる問題は、そのとき別に確かめる | B と同じ |
| ⑤ 記録・今日の練習・復習 | 使える(`ItemRecord`・`planner`・復習の間隔)。しかし**「クリア」「仮の合格」「12キー」の考え方**で、元のキー1つの Jazz には合わない。`BUILTINS` に入れると耳で弾くが拾ってしまう(§3)。今日の練習に入れないようにするには `todayPool:false` などの特例が要る | **完奏(`laps`)だけ。** 今日の練習・復習には出ない(利用者が決めた「クリアに入れない」と同じ) | 一覧で A の記録を出すと「クリア」が混ざり、決めたことと合わない |
| ⑥ 作る量・壊す心配 | `builtins.ts`・耳で弾く・planner に特例が広がる。壊す心配が一番大きい | 読み込み・画面の共通化・記録の置き場所。P12.5 の部品が使える | B より多く、利点が無い |
| ⑦ P12.5 を前提にする手間 | 不要 | §1 のとおり。文字の衝突は5ファイル。見えない衝突が1つ | B と同じ |

**おすすめ:B。** A は「ほかの音は無視」「押さえたまま」「データの音をそのまま見本に」がどれも今の `judgeChord`・`buildBuiltin` ではできず、できるようにするには変えない約束のところ(`judgeChord`・耳で弾く)に触ることになります。C は A の記録が「クリア」を連れてきて、決めたことと合いません。B は P12.5 がすでに同じ問題を解いています。

### 2.1 読み込み(`jazzProgressions.ts`)

**提案どおりでよい**(`OriginalProgression` と同じ形で返す別の読み込み)。

- `chord` は `parseTextChordLabel(parseLabel)`。`Dm6/9` は `Dm6(9)` で読める(根音 D・`min6`・テンション 9)。`label` は `display`(`Dm6/9`)
- **`display` を読ませてはいけない所がある**:`Dm6/9` は読めない(`null`)。`A13(9)`(005-a)は `display` で読むとテンション 9 付き、`parseLabel`(`A13`)は付かない。データの意図は `parseLabel` なので、読み込みは `parseLabel` だけを使う
- **コード名を `chord.label` から出さない**:`ChordSymbol` は音の高さ(0〜11)で持つので、`D♯7(♯9)` は `Eb7(#9)`、`D♭7` は `C#7` になる。画面の名前は `display`
- 音は `expectedNames`(名前)と `expectedPitches`(MIDI)から `left`・`right`・`carried`(`heldFromPrevious`)・`struck`(`pitch`)に。指は `fingers` から `Map<MIDI,'L5'|'R1'>`。音名(綴り)は別に `Map<MIDI,string>`
- 12キーは `shift`(今は 0 だけ)を引数に持たせておけば、`laps[id][tonic]` と合わせて伸ばせる
- 置き場所:`src/domain/chordDojo/jazzProgressions.ts`。**名前の衝突に注意**:master には `JAZZ_DEFS`・`JAZZ6_KEYS`(定番の進行)と、`JazzBrowserPracticeStorage`・`JAZZ_DOJO_PREFIX`(= **Dojo 自身の保存先** `loop-vault:chord-dojo-txt-jazz-v1:`。昔の呼び名が残っている)がある。Jazz Progressions の公開名は `JAZZ_PROGRESSIONS_*`・保存先の名前は `jazz-progressions` にして、`jazz` だけの名前を避ける(指示書の `JAZZ_GROUP_NAME`・`JAZZ_IDS` は、`JAZZ_DEFS` と紛らわしいので変えたい)

### 2.2 画面

**`OriginalPracticeView` はそのままでは使えません。** 違うところが多い:

| 今の `OriginalPracticeView` | Jazz で必要なこと |
|---|---|
| 題・キー選択(12キー)・ランダムキー・12キーの完奏の欄・大きなキー表示が固定で入っている | 出さない(元のキーの表示だけ) |
| `buildOriginal(originalId, shift)`・`originalTitle`・`originalLapStore`・`ORIGINAL_*` を直接使う | 読み込みと記録を差し替えられるようにする |
| 音名は `noteName`(`NAMES` の♭と ASCII の `#`)。**データの綴りと違う音が 282 音中 67 音**(`C♭4` が `B3`、`F𝄪3` が `G3`、`F♯4` が `F#4` など) | データの綴りを ♭♯𝄪 に直して出す(`b`→♭、`#`→♯、`x`→𝄪) |
| 指番号は出ない(`labels` を渡していない) | データの `fingers` から `labels` を作って渡す(§2.0 ③) |
| 派生の切り替え・`focus`・「推奨ボイシング(元の演奏の書き起こしではない)」 | 追加 |

**案**:`OriginalPracticeView` の中の「MIDI の受け取り・`HeldCardJudge`・切断/再接続・カード一覧・譜面・鍵盤・周回」の部分を**共通の部品に分け**、渡すものを(カードの並び・題・記録の入口・キー関係の部品を出すか)にして、Original と Jazz がそれぞれ薄い包みで使う。理由:切断・再接続の動き(P12.5 の hardening でいちばん手を入れた所)を**2か所に複製しない**。Original の既存の e2e(`p12-5-original.spec.ts` 194 行)と単体テストが、分けたあとも変わらず通ることで安全を確かめられる。
**かわりの案**(薄いが危ない):`OriginalPracticeView` を複製して `JazzPracticeView` にする。ただし 190 行のうち判定と切断の部分が複製になり、あとで食い違う。

**1280×720 の実測(重要)**:今の Original の練習画面(合わせた捨て用ブランチ)で測ると、上の「カードを置く領域」の高さは **1280×720 で 192px、1366×768 で 240px、1440×900 で 372px**(譜面 226px・鍵盤 168px は固定)。いまの画面は、その中に「キー選択の行 + 大きなキー表示(72px)+ カード(123px)」を入れているので、**1280×720 ではカードの2行目(右手の音)が折りたたみの下に隠れる**(Original でもすでにそう。P12.5 の写真は 1440/960/768 だけだった)。Jazz は「キーの行・大きなキー表示を出さない」ので 111px ほど空くが、そこに `focus`(1〜2行)・「推奨ボイシング…」・派生の切り替え・ヒントの行が入ると、**1280×720 は縦に余裕がない**。Stage 03 の写真(1280×720・1366×768)が本番の確かめで、`focus` の置き場所(上の細い行・譜面の見出し・カードの下で領域の中を縦スクロール)は、画面を見て決めたい。指番号つきの行(`G♯3(1) B3(2) D♯4(4) F♯4(5)`)は 176px のカードで2行に折り返す(はみ出さない)ことを確かめた。
測定に使った画面写真は一時の作業フォルダにあり、リポジトリには入れていません(Stage 03 で改めて撮ります)。

### 2.3 楽譜(`GrandStaff`)

`GrandStaff` は `TargetSnapshot` の `notes[].spelling`(文字・♯♭の数・オクターブ)をそのまま描きます(`𝄪`・`♭♭` も描ける)。今の経路(`targetSnapshot` → `spellMidi`)でデータを通すと、**282 音のうち 17 音(5枚)が、データの綴りと違って書かれます**:

| カード | データ | 今の楽譜 |
|---|---|---|
| 008 #1・008-a #1 `D7(♯9)` | F4(♯9) | E♯4 |
| 009 #1・009-a #1 `D♯7(♯9)`(各5音) | D♯2 A♯2 F𝄪3 C♯4 E𝄪4 | E♭2 B♭2 **G3** D♭4 **F♯4**(根音が E♭ として読まれ、重嬰が消える) |
| 010 #2 `D♭7`(5音) | D♭2 A♭2 C♭4 F4 A♭4 | C♯2 G♯2 **B3** E♯4 G♯4 |

ほかの指定の例(`A♭m7`・`Fm11`→`Emaj9`・009 の `Emaj9`・010 の `A♭m7` の `C♭4 G♭4`)は **データどおりに書ける**。

**案**:Jazz は `targetSnapshot` を通さず、**データの綴りから `TargetSnapshot` を直接作る**(`notes` は素の値。`spellMidi` は使わない)。`GrandStaff` は変えない。注意が1点:`GrandStaff` は高さ(`midi>=60`)で高音部/低音部を決めるので、`C♭4`(MIDI 59)は右手の音でも低音部の上に加線で書かれる(読める。気になるなら Stage 03 で見て決める)。妥協案(「音名の欄はデータ、楽譜は今の綴り」)は、上の5枚で楽譜の綴りが理論と違って見えるので、おすすめしない。

### 2.4 記録

| | 同じ記録(`original-practice`)に Jazz の id を足す | **別の記録(`jazz-progressions`)にする(おすすめ)** |
|---|---|---|
| 中身 | `originalRecordsSchema` の `laps` が `z.enum(ORIGINAL_IDS)`。Jazz の id を許すには、Original の厳しい検査をゆるめる。「今の Original の記録の中身を変えない」(指示書 §7)に反する | Original の記録は 1 バイトも変わらない |
| 古い版が Jazz の id の入った記録を読むと | 検査が通らず、**バックアップから復旧に回る**:有効なバックアップがあれば、**今の記録を隔離して古いバックアップに戻す**(Jazz の完奏は見えなくなる。消えはせず、隔離された所に残る)。バックアップが無ければ「完奏記録を読めません。元の記録を保持しています」で止まる(消えも上書きもされない) | 古い版は Jazz の記録の置き場所を知らないので、**触らない**(Rust は不明な置き場所を拒否するだけ) |
| 手間 | 小さい | Rust の置き場所1つ + 3つの表の足し(§1.1)+ 記録のクラスの共通化(下)+ テスト。P16 が `ear-practice` でやったのと同じ形 |

**おすすめ:別の置き場所。** 理由:指示書の「Original の記録の中身を変えない」を守れる。古い版への巻き戻しで Jazz の完奏が隔離される心配が無い。P16 と同じ前例がある。
実装は、`OriginalRecordsRepository`(CAS・バックアップ・隔離・再試行まで入った、P12.5 で一番手をかけた部分)を**複製せず**、`app` 名と `id` の一覧を渡せる形にして、Original と Jazz が使う(Original の既存テストが安全網)。**それでも手を入れたくなければ、同じ記録にする案**でも動くが、上の2点を引き受ける。
- 記録の形は `laps[id][tonic]`(進行 × 主音)。今は主音が1つ(進行のキー)だけ入り、12キーに伸ばしても形が変わらない
- `originalRecordKey`(`builtin:${id}:1`)は、**今は書き込みに使われていない**。P12.5 の最終版は、完奏を Dojo の記録(`store.ts`)に書かず、使うのは「未公開の途中版が Dojo の記録に書いた完奏を専用の記録へ移す」処理(`migrateOriginalLaps`)だけ。**Jazz は Dojo の記録に何も書かない**(移す古い記録も無い)ので、同じ仕組みは要らない

### 2.5 お手本

**進行を通して鳴らす仕組みは、今のアプリにすでにあります。** `playbackController.play(source, request)` の `request` に `{type:'notes', notes:[{pitch,startBeat,durationBeats,velocity}], bpm, sound}`(耳で弾く `earPlayback.ts`・ベース練習 `degreePlayback.ts` が使っている)。**Jazz のデータの `struck`(`pitch`・`offsetBeats`・`durationBeats`・`velocity`)とカードの `startBeat` が、この形にそのまま写る**(開始 = カードの `startBeat` + `offsetBeats`、テンポ 72)。足すのは「通して聴く」のボタンと、音のリストを組む関数(20行ほど)。
カード1枚を鳴らす(`L`・カードを押す)は今のまま(`{type:'chord', explicitMidiNotes: expected}` の和音)。「通して聴く」を**入れるかは利用者の判断**(§6)。入れない場合は指示書どおり「カード1枚だけ」。

### 2.6 鍵盤の幅

`answerKeyboardRange(notes, true)` は、音が C2〜C6(36〜84)の中なら**いつも C2〜C6**を返します(`min(36, …)`・`max(84, …)`)。Jazz の音は C2〜A♭4 なので常に C2〜C6。実測:鍵盤は 1280×720 で幅 1048・高さ 168、**横あふれ 0**(1280×720・1366×768・1440×900・768×640 のすべて)。鍵盤は問題なし。詰まるのは縦のカード領域(§2.2)。

## 3. 入れないことの確認

1. **耳で弾くの出題元**は、`BUILTINS`(`builtinSource.ts` の `builtinIds`・`buildBuiltinQuestion`)・出題用の進行(`bank.ts` と `earProgressions*.json`)・コレクション(`collection.ts`)だけ。**Original Practice のデータ・`originalPractice`・`originalRecords` を参照する所は、耳で弾く・planner・endless・collect のどこにも無い**(検索で0件)。Jazz を `BUILTINS` に入れなければ、**自動で入らない。合っている**。念のため、Stage 02 でテストにする(Jazz の id が `builtinIds()`・bank・コレクションのどれにも出ない)
2. **`BUILTINS` に入れずに一覧に出せる**。P12.5 が `BuiltinProgressionList.tsx` の `BUILTIN_GROUPS` の**あとに**、別の `<section id="dojo-builtin-original">` を足し、「まとまりへ移る」のボタンも足している(Original はそれで一覧に出る)。Jazz も同じ形(別の `<section>` とボタン)で足せる。`builtins.p12-3.test.ts`・`builtins.p12-4.test.ts` が `BUILTIN_GROUPS` の並びを固定しているので、そこには触らない

## 4. データが読めるか(master のコードで)

| 確かめ | 結果 |
|---|---|
| 全56枚の `parseLabel` が `parseTextChordLabel` で読める | **56/56**。`Dm6(9)` は根音 D・`min6`・テンション 9 で読める(011 の2枚目・012 の3枚目) |
| `display` と同じコードか | **56枚中53枚は同じ。3枚は、読み取りに渡せない/渡すと別の読み**:`Dm6/9`(2枚。`display` は読めない)・`A13(9)`(005-a の1枚。`display` はテンション 9 付き、`parseLabel` は付かない)。データの意図(`parseLabel` が正)どおりで、**直す必要は無い**。読み込みは `parseLabel` だけを使う(§2.1) |
| 全56枚の `expectedPitches` が `judgeChord` の `core`・`shape` で合格 | **57/57 通過**(提供のテスト `jazzProgressions.appJudge.test.ts` を `src/domain/chordDojo/` に一時的に置いて実行し、消した) |
| `check_jazz.py` | `21 progressions, 56 cards, errors: 0`。**ただし Windows の既定のままでは読めない**:ファイルを文字コード指定なしで開くので `UnicodeDecodeError`(cp932)。`python -I -X utf8 check_jazz.py …` で通る。`open(..., encoding='utf-8')` に直すとよい(Stage 02 のテストが同じ確認を TypeScript でやるので、実害は小さい) |

## 5. Stage 01〜03 の見込み

**B をすすめるので、段階の大きな組み替えは要りません。** 次の点を指示書に反映してください。

### Stage 01(統合ブランチ)

- 食い違いの直しは §1.1 の表と §1.2 のとおり。**`cargo test` が必須**(見えない衝突を見つけられるのが Rust のテストだけのため)
- テストは §1.5 のとおり。`npm run test:ui` に spec を並べると選択が広がって**ひどく長くなる**(今回 694 件)。**途中の確かめは `npx playwright test <spec>` で絞り、最後に `npm run test:full` を1回**にする
- Master 2-5-1 の2本は、長い実行のなかで時間切れで落ちることがある(単独では通る)。出たら、まず単独で再実行して確かめる
- 完了の条件に、**利用者が統合ブランチで Original Practice を実機で1周する**(§1.4)を入れる

### Stage 02(データと仕組み)

- §1.3(記録)を、**別の置き場所(`jazz-progressions`)**に書き換える:Rust の置き場所と `app` 名(`loopvault-jazz-progressions`)、TS の3つの表、記録の共通化、テスト(隔離・版1の維持・Original と Dojo の記録が変わらない)
- 読み込みは §2.1(`parseLabel` だけを使う、名前は `display`、綴りと指を一緒に返す)
- テストに追加:綴り(`b`→♭・`#`→♯・`x`→𝄪)の変換、**データの綴りから作った `TargetSnapshot` の確認(特に 008・009・010 の5枚)**、`display` と `parseLabel` の食い違いが §4 の3枚だけであること、Jazz の id が耳で弾くの出題元に出ないこと
- 公開する名前は §2.1 のとおり(`JAZZ_PROGRESSIONS_*` など。`JAZZ_DEFS` と紛らわしい名前を避ける)
- `data/check_jazz.py` の文字コード(§4)

### Stage 03(画面)

- **共通部品に分ける**(§2.2)。Original の既存の e2e・単体が変わらず通ること
- **1280×720 を最初に設計する**(§2.2):キーの行・大きなキー表示を出さず、`focus` の置き場所は写真で決める
- 定番の進行の一覧に Jazz のまとまりを足すと、**カードの枚数・グループの数を数えている既存の e2e(`p12-3-dojo.spec.ts`・`p12-4-progressions.spec.ts`・`p12-5-no-restart.spec.ts`・`p12-chord-dojo.spec.ts` ほか、P12.5 が 43→45 に直した所)の期待が、また変わる**(45 → 57)。指示書の「今の定番の進行・Original Practice のまとまりの並びと見た目は変えない」と矛盾しないよう、「並びと見た目は変えず、数を数える期待だけ直す」と書く
- `ChordDojoView.tsx` は1行が非常に長く、**行ごとのマージで毎回衝突する**。Jazz の追加は新しいファイルに置き、`ChordDojoView.tsx` には最小(画面の呼び出し1つ)だけ。`'original'` の画面を共用して、中で id を見て分ける案が一番小さい(`dojoNav.ts` を触らずに済む)
- 画面写真は、指示書の4サイズに加えて、**1280×720 では 001・009・010 のカードの2行目まで見えているか**を確かめる

### 心配な点

1. **見えない衝突**(§1.2):統合のたびに、保存先の確認のような「文字では衝突しない場所」が壊れうる。`cargo test` と、置き場所ごとの保存テストを必ず走らせる
2. **P12.5 の実機の確認が未了**(§1.4)
3. **1280×720 の縦の余裕**(§2.2)
4. 実機の MIDI キーボードでの確かめ(001・004・009)は、指示書どおり**利用者の確かめ**(実装の止まる条件ではない)

## 6. 利用者に決めてほしいこと

1. **載せ方は B(P12.5 の仕組み)でよいか**(§2.0。A・C はすすめない)
2. **記録は Jazz 専用の別の置き場所**(§2.4。おすすめ)か、同じ記録にするか
3. **Stage 01 で P12.5 を統合ブランチに入れてよいか**。P12.5-01(ヒントで戻らない・9コード以上でランダムキー)も一緒に入る(§1.4)。**統合ブランチで Original を実機で1周弾く確認**を、Stage 01 の終わりの条件にしてよいか
4. **練習画面は、キー選択・大きなキー表示を出さず、1280×720 に合わせて作り直してよいか**(§2.2)。`focus` の置き場所は写真を見て相談
5. **「通して聴く」ボタンを入れるか**(§2.5)。入れない場合はカード1枚だけ
6. (小さな点)楽譜は**データの綴りどおり**(§2.3。008 の F4、009 の F𝄪3・E𝄪4、010 の C♭4)でよいか

## 7. 今回の作業の記録

- 作業したブランチ:`audit/jazz-00`(この報告だけ)。捨て用:`trial/jazz-00-p125-merge`(`083cd6ef`。どこにもマージしない)
- 一時的に置いて消したもの:`src/domain/chordDojo/jazzProgressions.json`・同 `.appJudge.test.ts`・確かめ用のテスト2本・`e2e/tmp-jazz00.spec.ts`(いずれもコミットしていない)
- 提供のデータ・指示書は、リポジトリの外(スクラッチ)に展開して読んだだけです(リポジトリに入れていません)
- 元の演奏の名前・シリーズ名・URL・時刻は、この報告のどこにも書いていません
