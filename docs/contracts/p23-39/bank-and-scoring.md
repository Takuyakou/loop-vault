# P23-39 教材・評価契約(v3・凍結)

対象: Lv1–3 の bank、same-day / 遅延 / 耳の set、答え policy、正式合格の集約。
実行可能な正本は `src/courseDesign/bank.ts` / `answerPolicy.ts`、凍結 JSON は `bank-lv1-3-v2.json` / `policy-lv1-3-v2.json`、反例は `bank.test.ts` / `answerPolicy.test.ts` / `judgingCorrespondence.test.ts`。

## 1. レベルの細胞

| | 語彙 | 根音 | name cell | same-day | 遅延 | 耳 |
|---|---|---|---|---|---|---|
| Lv1 | maj / min | C G F A D E(6) | 12 | 20 | 10 | 10 |
| Lv2 | maj7 / min7 / dom7 / min7b5 | C G F A D E(6) | 24 | 20 | 10 | 10 |
| Lv3 | 6 quality | 全 12 | 30 | 30 | 12 | なし |

- Lv2 の 6 根音は承認済み設計どおり。各 quality 5 問(合計 20)で、quality ごとに 6 根音のうち 5 を使い、残り 1 根音の cell を遅延用の spare にする。20 問全体では 6 根音すべてが出る。
- Lv3 は 6 quality × 5 根音 = 30 cell。全 12 根音が最低 2 回出る。
- 問題の実体は **item**(stable ID)。item は cell(quality, root)、prompt(`name`/`ear`)、authored placement(root/inv1/inv2/inv3 の近接配置)、参照 notes、必須/許容 pitch class、bass policy を持つ。
- item 数: Lv1 name 36 + ear 12、Lv2 name 30 + ear 24、Lv3 name 60。合計 **162**。placement は「同じ cell を別の見本配置で出す」ための authored 値であり、採点の唯一の正解ではない。

## 2. same-day / 遅延 / 耳の set(実在する item ID)

`bank-lv1-3-v2.json` の `sets` が正本。same-day と遅延は item ID の配列で、**同じ item が両日に出ない**。並びは seed で変わるが、membership は seed に依存しない。

| level | set | 問数 | 成立している「別問題」 | 成立しないもの |
|---|---|---|---|---|
| Lv1 name | same-day / 遅延 | 20 / 10 | **別 item**。同じ cell では **別 placement**(遅延は 8 cell × inv2 + 2 cell × inv1) | 別 cell(同日で 12 cell を全部使う)、別順序だけ |
| Lv2 name | same-day / 遅延 | 20 / 10 | **別 cell 4 + 別 item + 別 placement 6**(spare cell 4、共有 cell 6 は inv1) | 別 cell だけで 10 問は不可(空き cell は 4) |
| Lv3 name | same-day / 遅延 | 30 / 12 | **別 item + 別 placement**(30 cell を同日で全部使うため、遅延は最初の 12 cell の inv1) | 別 cell、別順序だけ |
| Lv1 耳 | same-day | 10 | maj 5 / min 5。6 根音を網羅。2 択 + 実演 | 遅延耳は正式合格にない |
| Lv2 耳 | same-day | 10 | **4 quality すべて**:maj7 3 / min7 3 / dom7 2 / min7b5 2。6 根音を網羅 | 遅延耳は正式合格にない |
| Lv3 遅延 | delay | 12 | **6 quality × 2**。同日で全 30 cell を使うため別 cell は不可、別 item + 別 placement | 別 cell、別順序だけ |

- **別順序は別問題とみなさない。** 並べ替えだけでは同じ item の再利用を許さない。
- **評価セットの coverage は教材全体の coverage と別。** v2 は quality 順の配列の先頭を slice したため、Lv2 耳が maj7 6 / min7 4 で dom7・min7b5 0、Lv3 遅延が maj 5 / min 5 / maj7 2 で残り 0 だった。v3 は set ごとに quality の配分を明示し、`bank.test.ts` が set の quality 件数を検証する。
- 遅延確認は「翌日かつ 12 時間以上」に加えて、上の凍結 set をそのまま使う。実装が set を選び直すことはしない(P23-40 は `sets[level].name.delay` を読む)。
- 遅延の正式合格は Lv1 10/8、Lv2 10/8、Lv3 12/10。同日の再試験で同じ item を繰り返しても coverage は増えない。

## 3. 耳の条件(凍結)

| | Lv1 | Lv2 |
|---|---|---|
| 提示 | 根音(主音)を提示 → 1 回だけ和音を再生 | 同左 |
| 回答 | major/minor の **2 択を表示**し、選んでから実演 | 表示なし。quality を聴き分けて実演 |
| 判定 | 選択が正しい **かつ** 実演が和声 + 指定 bass を通る | 実演が和声 + 指定 bass を通る |
| bass | root(指定) | root(指定) |
| 再生回数 | 1 回。再生し直しはヒント(`hintUsed`)で、独立確認の分子に入らない | 同左 |
| 計測開始 | 音源終了コールバックの `performance.now()` を `armedAt` にする。終了前の Note On は無視 | 同左 |

- 耳の item は bank 内の合成単和音である(417 個の進行耳問題は Lv5/Lv7 の領域で、Lv1–3 の正式合格には使わない)。存在しない「2 択の単和音バンク」を前提にしない。
- 音源終了通知の精度・実音は未確認。P23-40 は既存の再生終了コールバックを写像するだけで、新しい耳エンジンを作らない。

## 4. 答え policy(分離)

| mode | 対象 | 必須 | bass | 一致しない例 |
|---|---|---|---|---|
| `name` | 記名 item | quality の必須構成音 | **未指定なら自由(転回可)** | 必須音の欠落、許容外の音 |
| `saved-voicing` | 保存進行の authored notes | 同じ notes・同じ octave・同じ doubling | authored のまま | 転回、オクターブ違い、音の追加 |
| `ear` | 耳 item | 必須構成音(和声) | root を指定 | bass が root でない、必須音の欠落 |

product の `normal` leniency に対応する必須音:

| quality | 必須 | 任意(省略可) |
|---|---|---|
| maj | root, 3 | 5 |
| min | root, ♭3 | 5 |
| maj7 | root, 3, 7 | 5 |
| min7 | root, ♭3, ♭7 | 5 |
| dom7 | root, 3, ♭7 | 5 |
| min7b5 | root, ♭3, ♭5, ♭7 | — |

- **P23-47-fix-2**: ガイド練習 Lv1/Lv3 の `maj`/`min` 三和音は第5音も必須（root, 3, 5）。`A-C` だけでは合格せず、`A-C-A` の重複でも第5音の代わりにならない。Lv2 のセブンスは従来どおり第5音を省略できる（上の表はその一般則）。

- 固定 fixture: Cmaj7 の root / 第1 / 第2 / 第3 転回 `[48,52,55,59] [52,55,59,60] [55,59,60,64] [59,60,64,67]` はすべて `name` で合格。`[48,52,59]`(5 度省略)も合格、`[48,52]`(7 度欠落)は不合格。
- `saved-voicing` は `[48,52,55,59]` だけを合格にし、転回を不合格にする。記名と混ぜない。
- product の `judgeChord('core')` は root bass を強制するため、記名ではそのまま使わず `answerPolicy.ts` の受理を使う(P23-40 の実装差分)。
- 見本(または耳の再生音)をそのまま弾けば、その課題の判定を通る(全 name/ear item で test)。

## 5. 正式合格の集約(公式)と部分得点

`evaluateLevel(level, evidence)` / `levelPass(...)` が公式。`evidence` は trial の配列で、`itemId` から bank の cell/quality/root を引く。

合格条件(すべて必要):

1. **same-day**: 凍結 set の全 item が評価済み(20/20、30/30)。重複 item・set 外 item・未実施 item があれば不合格。invalid は分母から除外し、再試行する。
2. **全体正答**: MIDI 確認済み・ヒントなしの正答が `pass` 以上(18/20、27/30)。自己確認だけの正答は分子に入れない。
3. **quality**: Lv2/Lv3 は各 quality 5 問すべてが評価済みで、独立正答が 4/5 以上。1 quality でも 3/5 なら不合格(他 quality の平均で隠さない)。
4. **根音 coverage**: Lv1/Lv2 は 6 根音、Lv3 は 12 根音を same-day で確認。欠けた根音があれば不合格。
5. **遅延**: 凍結した遅延 set の全 item が評価済みで、独立正答が Lv1/Lv2 8/10、Lv3 10/12 以上。
6. **耳**: Lv1/Lv2 は凍結耳 set 10 問すべてが評価済みで、独立正答 8/10 以上。Lv3 に耳 block はない。
7. **速度(Lv3 のみ)**: 独立正答のうち `speedMs <= 3000` が 80% 以上。`speedMs` の無い正答は「以内」に数えない。
8. **日時**: 評価済みの全 trial に `at`(封緘時刻)があること。遅延 block の**開始**が同日 block の**完了**(同日 trial の最大 `at`)より後のローカル日付で、かつ 12 時間以上後であること。時刻欠落・同日・12 時間未満・逆行はすべて不合格。

### 5.1 遅延の日時判定(注入時計)

`delayEligibility(sameDayCompletedAt, delayedStartedAt)` が正本。ローカル日付は `localDateKey`(端末のタイムゾーンの暦日)で比較する。`Date` は保存された ISO 8601 をそのまま使う。

| 例(端末のローカル時刻) | 判定 |
|---|---|
| 11/17 20:00 完了 → 11/18 09:00 開始(13 時間) | 合格 |
| 11/17 00:30 完了 → 11/17 13:30 開始(13 時間、同日) | 不合格(同じ日) |
| 11/17 22:00 完了 → 11/18 08:00 開始(10 時間) | 不合格(12 時間未満) |
| 11/17 20:00 完了 → 11/17 19:00 開始 | 不合格(逆行) |
| どちらかの時刻が欠落 | 不合格(時刻なし) |

- 「翌日」は 24 時間ではなく**ローカル日付が変わること**。「12 時間以上」は別に必須。
- 遅延 block の判定には**開始**(最小 `at`)を使う。途中の trial だけが翌日でも、開始が同日なら不合格。
- 実時間待ち・新しい復習機能・タイマーは不要。保存済みの時刻だけで判定する。

- `evidence.mode === "midi"` でなければ公式合格にはならない。自己確認(`self`)は別の進捗区分で、「合格」と表示しない。
- `practiceProgress(level, evidence)` は**部分得点**専用。評価数・正答数・必要数を返すが、`formal: false` で、進級判定には使わない。名前と範囲を明示するために分離した。
- 反例(`bank.test.ts`): 空の evidence、quality block 欠落、評価 25/30、27 正答でも 1 quality 3/5、重複 item、自己確認 mode、ヒントあり正答、速度なし、はすべて不合格。invalid を足しても評価 set が完全なら合格のまま。

## 6. v1 / v2 → v3 の差分

| v1/v2 の問題(レビュー) | v3 |
|---|---|
| Lv2 policy `roots=6` に対し bank は 5 根音(C/G/F/A/D) | bank を 6 根音(C/G/F/A/D/E)にし、5 問/quality を保ったまま spare cell を遅延に使う |
| Lv2 の耳 10/8 が policy から落ちている | Lv2 に ear `{questions:10, pass:8}` を戻し、耳 set を bank に実在させる |
| 同日/別日の「別問題」が prose だけで、Lv1 は別 cell が成立しない | set を item ID で凍結。Lv1/Lv3 は「別 item + 別 placement」、Lv2 は「別 cell 4 + 別 item/placement 6」と明示。別順序だけは不可 |
| 記名が source voicing の bass を要求 | 未指定 bass は自由(転回可)。保存 voicing 完全一致は別 policy。固定 fixture で転回を確認 |
| Lv3 24/22 と quality 4/4 の矛盾 | 30/27、各 quality 4/5、3 秒 80%(v1 から維持) |
| **v2: Lv2 耳が maj7 6 / min7 4 で dom7・min7b5 0** | **v3: maj7 3 / min7 3 / dom7 2 / min7b5 2(10 問維持)** |
| **v2: Lv3 遅延が maj 5 / min 5 / maj7 2 で残り 0** | **v3: 6 quality × 2(12 問維持)** |
| **v2: 「翌日かつ 12 時間以上」を評価できない** | **v3: `at` を必須にし、ローカル日付 + 12 時間を公式合格で判定。時刻欠落/同日/12 時間未満/逆行は不合格** |

旧 pair と hash は `freeze-history.md` と `freeze-manifest.json` の `supersedes`。v1/v2 は正式凍結ではない。
