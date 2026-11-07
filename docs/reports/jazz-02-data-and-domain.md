# Jazz-02: データと読み込み(画面はまだ)

ブランチ `feat/jazz-02-data`(master の上。コードのコミット `fa695f3d`)。画面は何も変えていません。push・タグ・master へのマージはしていません。
推奨ボイシング(元の演奏の書き起こしではない)のデータを、master の上に置き、読み込み・記録・テストを作りました。Stage 00 の承認(方式 B・記録は専用の置き場所・綴りはデータどおり・「通して聴く」を入れる)に従っています。

## 0. 先に:master の状態

利用者の実機の確認が済んだので、`integrate/p12.5-on-master`(P12.5 を取り込み済み)を **master に早送りで入れ**、続けて Stage 00 の報告(`audit/jazz-00`)を入れました(`6528856c`)。push はしていません。そのうえでこのブランチを master から切っています。

## 1. 置いたファイルと形

| ファイル | 中身 |
|---|---|
| `src/domain/chordDojo/jazzProgressions.json` | 提供のデータを **1バイトも変えずに**置いた(21進行・56枚・12項目) |
| `src/domain/chordDojo/jazzProgressions.ts` | 読み込み(下) |
| `src/domain/chordDojo/lapRecords.ts` | 完奏の記録の共通部分(下 §3) |
| `src/domain/chordDojo/jazzRecords.ts` | Jazz の完奏の記録 |
| `src/domain/chordDojo/originalRecords.ts` | 共通部分の上に薄く載せ替えた(動きは同じ) |
| `src/features/bass-practice/infra/repository/practiceStorage.ts`・`src-tauri/src/practice_storage.rs` | 置き場所 `jazz-progressions` を足した |
| テスト | `jazzProgressions.test.ts`・`jazzProgressions.appJudge.test.ts`(提供のものをそのまま)・`jazzRecords.test.ts`・`practice_storage.rs` の Rust のテスト |

### 1.1 読み込みの形(`jazzProgressions.ts`)

- `buildJazzProgression(id)` → `JazzProgression`:`id`・`item`・`main`・`variantLabel`・`title`・`key`・`tonic`・`mode`・`tempoBpm`・`bars`・`focus`・`cards`・`degrees`。**移調はしない**(元のキーだけ)
- カード `JazzCard` は Original のカード(`OriginalCard`)と同じ形(`expected`・`struck`・`carried`・`left`・`right`・`chord`・`label`・`degree`・`startBeat`・`durationBeats`・`offsets`)に、画面用を足したもの:
  - `display`(`label` と同じ。`Dm6/9`・`D♯7(♯9)`)・`keyContext`
  - `names`(音の高さ → `C♭4`・`F𝄪3`)・`leftNames`・`rightNames`
  - `labels`(音の高さ → `L5`/`R1`。鍵盤と楽譜の指番号の元)・`written`(楽譜の綴り)
- `chord` は **`parseLabel`** を `parseTextChordLabel` で読んだもの(`Dm6/9` は `Dm6(9)` で読む)。**画面の名前は `display`**(`chord.label` は綴りを持たないので使わない)
- `jazzCardSnapshot(progression, index)`:**データの綴りと指から作った楽譜・鍵盤用の `TargetSnapshot`**(`GrandStaff` は変えない)
- `jazzPlaybackNotes(progression)`:「通して聴く」用。`struck` とカードの `startBeat` から、`{type:'notes'}` の再生にそのまま渡せる音のリスト(テンポは進行の 72)
- 項目の一覧・主の進行:`JAZZ_PROGRESSIONS_ITEMS`(12)・`jazzMainOf(item)`・`jazzItemOf(id)`。**名前**:`JAZZ_PROGRESSIONS_GROUP_NAME`(`Jazz Progressions`)・`JAZZ_PROGRESSIONS_IDS`(21)・`isJazzProgressionId`・`JAZZ_PROGRESSIONS_NOTE`(「推奨ボイシング(元の演奏の書き起こしではない)」)。`JAZZ_DEFS`・`JAZZ_DOJO_PREFIX`(Dojo の昔の呼び名)と紛れないよう、`jazz` だけの名前は使っていない
- 綴り:`parseWrittenName`(`b`→♭・`#`→♯・`x`→𝄪)・`writtenLabel`・`writtenPitch`
- `jazzRecordTonic(progression)`:完奏を数える主音(今は進行の元のキー。12キーを足すときの口)

## 2. 記録の形

- **専用の置き場所 `jazz-progressions`**(P16 の `ear-practice`、P12.5 の `original-practice` と同じ形)。Rust:`jazz-progressions-v1.json` と `jazz-progressions-storage/`、`app` は `loopvault-jazz-progressions`、版は 1 のまま保つ。ブラウザ:`loop-vault:jazz-progressions-v1:`。**Original の記録・Dojo の記録・耳で弾くの記録には1バイトも書かない**。古い版のアプリはこのファイルを開かない
- 中身:`laps[進行の id][主音(0〜11)] = {count, lastAt}`。完奏の数は進行の id ごと(元のキーだけ)。**12キーに伸ばしても形は変わらない**
- Original と同じく、CAS(版と内容の確認)・直前20件のバックアップ・壊れた/新しい版の記録は**そのまま保持して止まる**・未保存の完奏は画面に保持して再試行する(Original の hardening をそのまま共有)
- **Rust**:`is_lap_record_file`(Original と Jazz)で、未対応・新しい版のデータの保護と、バックアップだけが残る場合を初回と取り違えない扱いを両方に適用。`save_document_unlocked_with_fault` の `app` の確認は、ファイル名の `match` に Jazz を足して **5ファイル**

### 2.1 Original の記録への手入れ(共通化)

`OriginalRecordsRepository` の中身(CAS・バックアップ・復旧・再試行)を `LapRecordsRepository`(`app` とスキーマを渡す)に移し、Original はその上に薄く載せた。`originalLapStore` も `createLapStore` から作る。**動きは変えていない**:Original の既存テスト(`originalRecords.test.ts` 10件・`originalPractice*.test.ts`)・e2e(`p12-5-original.spec.ts`・`p12-5-no-restart.spec.ts`)が、変更なしで通る(下の FULL)。

## 3. テストの結果

| # | 内容 | 結果 |
|---|---|---|
| 1 | 12項目・21進行・56枚、id が重ならない、各項目に主が1つ | 通過 |
| 2 | 全56枚の `parseLabel` が読めて、コードが想定どおり(`display` が読める所は根音・種類も同じ) | **56/56**。`display` を読むと違う所は3枚だけ:`A13(9)`(005-a)・`Dm6/9`(011 の2枚目・012 の3枚目)。この3枚をテストで固定した |
| 2 個別 | `Dm6(9)`(`Dm6/9`)の読み取り | 根音 D・`min6`・テンション `9`。`Dm6/9` そのものは読めない(`null`)ことも固定 |
| 3 | 全56枚の `expectedPitches` が `judgeChord` の `core` と `shape` で合格 | **56/56(両方)** |
| 4 | 一番低い音が左手の根音・手が重ならない・C2〜C6 | 56/56 |
| 5 | 左右の手 = 名前の集合。名前の高さが合う(`x` は +2) | 56/56 |
| 6 | 指の順(左は低い順に大→小、右は小→大) | 56/56 |
| 7 | `struck` + 押さえたまま = 音。1枚目は押さえたままが無い。押さえたままは前のカードで同じ手・同じ指・同じ高さ(A♭3 → G♯3 を含む) | 通過 |
| 8 | `HeldCardJudge` で全進行を通しで弾く(押さえたままは離さない、`struck` を押し直す、余分な音を足しても合格、離す/押し直さないと合格しない、1周の終わりで次の1枚目は通らない) | 21進行すべて通過 |
| 9 | 題・`focus`・`note` に `http`・`youtube`・`動画`・`mm:ss` が無い(データ全体も) | 通過 |
| 9a | 似た名前の取り違え:`D6/9`≠`Dmaj9`・`E♭7(9)`≠`E♭maj9`・`Emaj9`≠`E7`・`A7(♭13)`≠`A♭13`・`A13(♭9)` の ♭9 は B♭・`A13(9)` の 9 は B・010 の最後は三和音・`Dm6/9` の 6 は B・009 の最後は `Cmaj9`・004 に D のコードが無く `Asus(11)13`≠`A13` | 通過(音の組み立てで確かめた) |
| 9b | 009 の3・4枚目だけ `keyContext` が `Em`、ほかは進行のキーと同じ | 通過 |
| 10 | 耳で弾くの出題元に Jazz が入らない | 通過:`builtinIds()`・出題用の進行(bank)・Dojo の `BUILTINS` に無い。さらに耳で弾くの**ソース(`earPractice`・`views/ear-practice`)が Jazz のファイル・名前を1つも参照しない**ことを検索で固定 |
| 11 | 記録 | 通過(下) |
| 追加 | 綴りと楽譜:全56枚のスナップショットの各音が、データの綴りと指のとおり(高さ・手・指が一致)。008 の `F4`・009 の `F𝄪3`/`E𝄪4`・010 の `C♭4` を明示。今までの綴り方(`targetSnapshot`)とは違うことも確認 | 通過 |
| 追加 | 「通して聴く」の音のリスト:各カードの開始拍に `struck` の音が過不足なく並ぶ | 全進行で通過 |

**テスト11(記録)**:Jazz の完奏を足しても、Original の完奏と Dojo の記録は**1バイトも変わらない**(逆も同じ)。完奏は進行×主音で数え、同じ操作を2度告げても1回。壊れた記録は(戻れるバックアップが無ければ)読めないと言って止まり、書き換えない。新しい版の記録はそのまま保持して止まる。壊れた記録で、バックアップがあれば戻し、壊れたものは別に残す。**どの場合も Original と Dojo の読み込みは影響を受けない**。Original の記録は Jazz の id を受け付けない(Jazz の記録も Original の id を受け付けない)。

**Rust**:置き場所5つ(通常・ベース・耳で弾く・Original・Jazz)が自分の `app` の入れ物だけ保存でき、ほかの4つは拒否される(`every_storage_namespace_accepts_only_its_own_app`)。Jazz の記録の分離・版 1 の維持・新しい版の保護の専用テスト(`jazz_progressions_are_isolated_keep_version_one_and_preserve_future_data`)。

## 4. 通らなかったもの

**ありません。** データは提供のまま通りました(直す・外すことはしていません)。

## 5. 全体の確かめ

| 確かめ | 結果 |
|---|---|
| 型・ESLint・クラス lint・source contracts | 通過 |
| `cargo test --lib` | **70/70**(`practice_storage` は 18) |
| `npm run test:full`(1回。コード `fa695f3d`) | **PASS**(1229.9秒)。Vitest 全体 PASS・Playwright **695/695**・本番ビルド・privacy・phase docs・`git diff --check` |
| 公開の決まり | 差分に元の演奏の名前・シリーズ名・URL・時刻は無い(テスト9で検索) |

## 6. 気づいた点(次の Stage 03 へ)

- Original の画面(`OriginalPracticeView`)は、まだ `originalLapStore` と `buildOriginal` を直接使っています。Stage 03 の共通部品への分け方で、`createLapStore` のおかげで Jazz は `jazzLapStore` をそのまま渡せます
- `check_jazz.py` は `python -X utf8` で動かす必要があります(Windows の既定の文字コードで読めない)。テストが同じ確認を TypeScript でやるので、本体への影響はありません

止まります。次は Stage 03(画面)です。承認をお願いします。
