# P15-02 設計：「線で分ける」と、元のパートとの対応（実装の前の設計 1 枚）

対象：`feat/p15-import-check`（`c84890db`）。**コードは 1 行も書いていません。** 承認をもらってから実装します。
決定書 `P15-00-decisions.md` §3 の 4 つの問い（§1〜§4 の見出しに対応）に答えます。事実は読んだコードの場所を添え、推測は「推測」と書きます。

## 0. 要点（先に）

**仮のパートは、解析の入力を組み立てる直前の「派生セッション」の中だけに作ります。** 画面の `AnalysisSession` は元のパートのまま変えません。
- 解析の中身（`src/domain/midi/**`）にも、解析に渡す入力の組み立て（`analyzerInput.ts`）にも、**手を入れません**（設定でこの場所は編集できない。この設計は、編集しなくて済む形です）。
- 元のパートへの対応は、派生セッションを作る関数が返す**対応表 1 つ**に持ち、使う場所（修正作業場の表示）で 1 か所だけ戻します。
- 保存されるボイシングと役割の訂正ログには、**仮のパートの id がそもそも届きません**（理由は §2）。

## 1. 仮のパートを、どこで元に戻すか

### 1.1 事実（対応が切れる場所）

| 場所 | 何を使っているか | 出典 |
| --- | --- | --- |
| 解析に渡る入力 | `preparedData.tracks[]` と `notes[].trackIndex`。**選んだパートの並び順の連番**（0, 1, 2 …）に振り直す。`tracks[].name` は常に空 | `analyzerInput.buildPreparedMidiSongData` |
| 解析後の元データ | `analyzeMidiBytes` が `sourceData = preparedData`、`sourceVoices = annotateVoiceRolesV2(buildVoices(sourceData), …)` を作り、ストアの `analysis` に持つ | `vaultStore.ts` 753〜787 |
| 保存されるボイシングの抽出 | `attachSourceVoicings` が、同じ `sourceData` と `sourceVoices` で音を集める（メロディ役の音は重み 0.2） | `domain/voicing/sourceVoicing.ts` |
| 修正作業場 | `buildCorrectionModel` が `sourceData.notes` の `trackIndex:channel` を `sourceVoices` に引き当てる。表示名は `trackName`、無ければ「トラック{trackIndex+1}」 | `correctionModel.ts` 156〜197 |
| 役割の訂正ログ | **元のセッションの `voices`** から作る。パートの id は入らない | `roleCorrectionLog.ts`、`CaptureView` の `onAnalyze` |

つまり、解析後に「元のパート」を知るのは、修正作業場の**表示名**だけです（保存されるデータには、パートの id・`trackIndex` は残りません。`VoicingSnapshot` は `midiNotes` などだけ：`domain/types.ts` 71〜83）。

### 1.2 設計：派生セッション（1 か所で作る）

新しいファイル `src/domain/preAnalysisParts/splitSession.ts`（編集が許されている場所）に、純粋な関数を 1 つ置きます。

```
splitSessionForAnalysis(session, splits) → { session: AnalysisSession; map: PartMap }
```

- `splits`：パート id → `{ melodyFrom: number; bassBelow?: number }`（音高。**セッション中だけ持つ**。保存しない）。
- 戻りの `session` は**解析の入力を作るためだけ**に使い、画面の状態には戻しません。
- `splits` が空なら、**入力と同じオブジェクトをそのまま返す**（何も変えずに解析 → 今と同じ、を壊さないため）。

派生セッションの作り方（線のあるパート `P` ごと）：

| 仮のパート | 音 | `assignedRole` | `autoRole` | その他 |
| --- | --- | --- | --- | --- |
| 下（コード） | `pitch < melodyFrom`（ベースの線があれば `bassBelow ≤ pitch`） | `harmony` | `exclude` | `included: true` |
| 上（メロディ） | `pitch ≥ melodyFrom`（**線の音ちょうどはメロディ側**） | `melody-weak`（決定 1-2） | `harmony` | `included: true` |
| 最下（ベース。ベースの線があるときだけ） | `pitch < bassBelow` | `bass` | `harmony` | `included: true` |

- 共通：`P` のほかの項目（`channel`・`programNumbers`・`dominantProgram`・`isDrum`・`solo`・`muted`・`visible` など）は**元のまま**。`id` は `${P.id}~lower` / `~upper` / `~bass`、`displayName` は元の名前に「（線より下）」「（線より上）」「（ベースの境目より下）」。音数・音域・平均の同時発音数は、振り分けた音から数え直す。
- **`autoRole` をわざと `assignedRole` と食い違わせる**のは、2 つの決まりのためです：
  (a) `harmonic-core` のとき、`buildPreparedAnalysisInput` は「`assignedRole === autoRole` のパートは役割を上書きしない」。仮のパートの役割を**必ず上書きとして渡す**（決定書 Stage 02 §4「役割の上書きが、線で決めた役割を消さない」）。
  (b) `isBackwardEquivalentSession` は「全パートが `assignedRole === autoRole`」を求めるので、**線のあるセッションは従来の経路に流れない**（偽になる）。`analyzerInput.ts` を変えなくて済みます。
- 派生セッションの `voices` は、`P` の位置に「下・上・（最下）」を**その順で差し替え**ます。解析に渡るパートの並び（= `trackIndex` の連番）は、その順になります。ほかのパートの連番は、今でも「選んだパートの数」で変わるので、新しい問題は増えません。
- `notes`：`P` の音を 1 つずつ見て、**音を複製せず**、`voiceId` だけを仮の id に付け替えた**新しいオブジェクト**を作る（元のセッションの音は変えない）。高さ・始まり・長さ・強さ・`startTick`・`durationTick`・`program` は元のまま。
- `controlChanges`：`P` のコントローラ（サスティンペダル CC64 など）は、仮のパートのそれぞれに**同じ内容で付ける**（ペダルで伸びる音の終わりは、解析が `controlChanges` から計算するため、片方だけだと、同じペダルの下の音の長さが変わってしまう）。これは音の複製ではない。
- ドラム・重複（`duplicateOf` あり）・`included` が偽のパートには、線を**設定できません**（画面で無効に）。

### 1.3 戻す場所（解析の直後ではなく、使う場所）

決定書の例は「解析の直後に、結果の仮の `trackIndex` を元のパートに書き戻す」でした。調べた結果、**書き戻すと逆効果**です：

- `sourceData` の音を元の `trackIndex:channel` に戻すと、元のパートが再び**1 つの Voice** になり、`buildVoices` は上の音も下の音も同じ役割で見ます。**メロディ役の仮のパートがあることで効く部分**（修正作業場の「メロディの Voice の音」の判定、保存ボイシングのメロディ混入の抑え）が、**線を引いた意味ごと消えます**。
- 保存されるボイシングは、`analyzeMidiBytes` の中で、書き戻す前の `sourceData` から作られます（解析の直後に書き戻しても、そこには間に合いません）。

したがって、**音の `trackIndex`・`channel` は仮のまま**にして、**「どの仮のパートが、どの元のパートか」の対応表だけ**を持ち、人に見せる所で戻します。

```
PartMap = {
  preparedOrder: string[];                 // 解析に渡った仮のパート id（並び = 解析後の trackIndex）
  origin: Map<仮のパート id, { partId: 元のパート id; side: "lower"|"upper"|"bass"|"whole" }>;
}
```

- `preparedOrder` は、`buildSessionAnalysisRequest` の戻りの `selectedVoiceIds`（公開されている）そのものです。`selectedVoiceIds[i]` が、解析後の `trackIndex === i` のパート。
- **戻す変換はこの 1 つ**：`restorePartNames(sourceVoices, map, session)`（`src/domain/preAnalysisParts/restore.ts`）。`sourceVoices` の各 `Voice`（`trackIndex = i`）に、`trackName` を「元のパートの名前（＋「線より上」など）」にして返す。**音は触らない。**
- 呼ぶ場所は 1 つ：`CaptureView.tsx` の `correctionModel` を作る `useMemo`（今 `analysis.sourceVoices` をそのまま渡している所）。線が無いときは `map` が無いので、今までの動きと同じ。

## 2. その変換は、3 つのすべてに効くか

| 対象 | どうなるか |
| --- | --- |
| **修正作業場** | `restorePartNames` を通した `sourceVoices` を渡すので、「メロディの Voice（Piano（線より上））」のように、**元のパートの名前**で出る。音の id（`trackIndex:channel:startTick:pitch`）は仮のままだが、セッション中だけのもの（`CorrectionModel` の注記「Session-only」）で、人に見えない |
| **保存されるボイシング** | 変換は要らない。保存される `VoicingSnapshot` は `midiNotes` などだけで、パート id も `trackIndex` も持たない（`types.ts`）。**音の中身**は、仮のパートに分けても欠けない（§1.2 の「欠かさず・増やさず」）。メロディ側の音は、今の `melody-weak` と同じ重み 0.2 で残る（決定 1-2） |
| **役割の訂正ログ** | 元のセッションから作るので、仮のパートは**届かない**。ログの形は変えない。線を使ったことは記録されない（`manuallyChanged` は `assignedRole !== autoRole` のまま）。これは、形を変えない決まり（決定書 §3-6）を優先した結果で、必要なら別の作業 |

**その他、仮の id が見える場所**（一覧）：
- `captureAnalysisRunSummary`（「和声を強調 n Voice」の数）は `analysisInput.voices` を数える：仮のパートも 1 つとして数えられる。表示は「パート」の数なので、**元のパートの数で数え直す**（対応表を使う）。
- `captureAnalysisTargetLabel`（結果の上の「解析対象: …」）は元のセッションの `voices` から：元のパート名のまま。線を使ったときは「（線で分けたパートあり）」を添える（提案）。

## 3. 戻した後で、元の MIDI と 1 音ずつ照合できるか（Stage 02 テスト 4）

テストは、**対応表を使って、解析に渡った音を元に戻した結果**を、元のセッションの音と比べます：

```
originalNotesOf(preparedData, map, session) → { partId, pitch, startTick, durationTick, velocity, program }[]
```

- 仮の `trackIndex = i` の音を、`origin[preparedOrder[i]].partId` の音として返す。
- 照合：元のパート `P` の全ての音（`session.notes` のうち `voiceId === P.id`）と、`originalNotesOf` の `P` の音を、**キー `(pitch, startTick, durationTick, velocity)` の多重集合として比べる**。欠け 0・重複 0・中身の違い 0。
- 複数のパート・複数のファイル・ベースの線あり（3 分割）・同じ高さと始まりの音が重なる場合（多重集合で扱う）でも成り立つ。
- 解析に渡る `preparedData.notes` の `startTick` は `round(startBeat × ppq)` なので、元の `startTick` との比較は、**同じ丸め**（`buildPreparedMidiSongData` と同じ式）で作る元側の値と行う（元の MIDI の `startTick` と丸めの差が出ない PPQ で、別に確かめる）。

## 4. 解析の中身に手を入れずに済むか

済みます。

| 触れるもの | 触れるか |
| --- | --- |
| `src/domain/midi/**`（解析・`preAnalysis/analyzerInput.ts` を含む） | **触れない**（設定で編集不可。この設計は触れずに成り立つ） |
| `src/domain/preAnalysisParts/**`（新規：派生セッションと戻し） | 新規 |
| `src/components/pre-analysis/**`（境目の線の UI・色・要約） | 変更 |
| `src/views/CaptureView.tsx`、`src/views/capture/useCaptureIntake.ts`（線の状態の保持・派生セッションで要求を作る・戻しの呼び出し） | 変更 |

`buildSessionAnalysisRequest(派生セッション)` は、今のままの関数を、**普通のセッション**を渡して呼ぶだけです（仮のパートも、ふつうの `AnalysisSessionVoice`）。

## 5. 線の状態と画面（Stage 02 §1・§2 の要約。設計に必要な分だけ）

- 状態：`partSplits: Record<パート id, { melodyFrom: number; bassBelow?: number }>`。`useCaptureIntake` が `preAnalysisSession` と並べて持つ（ファイルを足す・外す・別のファイルを開くときに、存在しないパートの分を捨てる）。保存しない（Stage 03 の「前回と同じ設定」を除く）。
- 画面（決定 1-1）：混在の選択（分けない / アプリに任せる）は一覧の上に 1 つのまま。**「このパートを線で分ける」**はコードのパートのカードの中の別の道具（既定では出さない）。線のあるパートのカードに「線がこのパートでは優先されます」と書く。
- ロール：線の上下の音の色が、そのまま「解析でどう扱われるか」（上＝メロディ色、下＝コード色、ベースの線の下＝ベース色）。**「アプリに任せる」の濃淡は、派生セッションを使って計算する**（`harmonicCoreNoteMultipliers` に派生セッションを渡す）ので、線のある曲でも、解析と同じ重みを表示できる。
- 線の最初の位置：決定書 §2.4 の代替案（「その高さより上で鳴る音の 80% 以上が単音になる、いちばん低い高さ」）を使う。和声コアの分類結果は使わない（音ごとに結果が変わり、「高さの線」の初期位置として安定しないため。監査 §2-4 のとおり）。見つからなければ、パートの最高音の上（実質、分けない）。
- 文言（決定 1-2）：「線より上の音は、コード名を決めるときに弱く扱います（消しません）」「音域が重なる曲では分けきれない簡易的な方法です」。

## 6. テスト（Stage 02 §5 に、設計から足したもの）

| # | 内容 |
| --- | --- |
| 4 | **元の MIDI との 1 音ずつの照合**（§3）。ベースの線あり・複数パート・複数ファイル |
| 4a | 派生セッションを作っても、元の `AnalysisSession`（`voices`・`notes`・`controlChanges`）が**変わらない**（深い等価） |
| 4b | 線が空のとき、`splitSessionForAnalysis` は入力と**同じオブジェクト**を返す。その要求が、今の `buildSessionAnalysisRequest(session)` と深い等価 |
| 7 | 派生セッションから作った `preparedData` の `trackIndex` が、仮のパートを含めて重ならない。`channel` は元のまま |
| 9 | 線のあるセッション（`autoRole` を食い違わせた仮のパート）で、`isBackwardEquivalentSession` が偽 |
| 10 | 線を外す（空に戻す）と、要求が線を引く前と深い等価 |
| 11 | 役割の訂正ログに仮の id が出ない（ログの形・件数は元のパート数のまま） |
| 14 | **ペダルのある曲**で、仮のパートごとの音の終わり（`sustainedEndBeat`）が、分ける前の同じ音と同じ（`controlChanges` を両方に付けた理由の確認） |
| 15 | `restorePartNames`：仮のパートの `trackName` が元のパートの名前になる／線が無ければ恒等 |
| 8 | **3 方式の比較**（分けない / アプリに任せる / 線で分ける）を合成データ 3 種類で。**関門（決定 1-2）：音域が離れている例で「線で分ける」が「分けない」より正解率が上がらなければ、実装を止めて報告する** |

## 7. 承認がほしいこと

1. **派生セッション方式でよいか。** 決定書の例（解析の直後に `trackIndex` を書き戻す）とは違い、**音は仮のまま・名前だけ戻す**方式です。理由は §1.3（書き戻すと、線を引いた意味が消える）。
2. **ペダル（CC64）を仮のパートの両方に付けること**（§1.2）。音は増やさないが、コントローラは複製される。
3. **線の最初の位置は「80% 単音」の代替案**（和声コアの分類は使わない）。
4. **ベースの境目を、最初から入れるか**（Stage 02 §2 は「＋ ベースの境目」を別に出すとある）。入れる場合は上の設計のまま（3 分割）。
5. 線を使ったことが**訂正ログに残らない**こと（ログの形を変えない決まりの結果）。

## 8. まだやっていないこと

実装・テスト・画面の変更は、承認の後です。**関門のテスト 8 は、実装の最初に書いて**、効かなければそこで止めます。
