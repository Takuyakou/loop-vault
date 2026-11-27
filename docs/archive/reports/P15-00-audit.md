# P15-00 調査報告（実装なし・製品コードの変更なし）

対象：`master` `183240bb`（指示書が読んだ `7a3d432a` の後。`src/components/pre-analysis`・`src/domain/midi`・`src/views/CaptureView.tsx`・`src/storage` に差分は**無い**ので、指示書 §2 の前提は同じコードを指しています）。
ブランチ `feat/p15-import-check`（`master` から）。製品コードは 1 行も変えていません。
「事実」はコードを読んだ結果（ファイルと行）です。「推測・提案」は分けて書きます。実際に動かして確かめたものは、そう書きます（今回は読むだけで、実行はしていません）。

## 0. 先に結論（指示書の前提とずれる所）

| # | 指示書の前提 | 実際 |
| --- | --- | --- |
| 1 | 「和声コア」は同じパートの中で和声とメロディ寄りの音を見分け、**ベースを解析対象から外す** | **半分だけ正しい。** ベースが外れるのは「再採点の証拠」だけです。区切り・最初の候補を作る従来の解析（`analyzeMidiWithRankingScores`）には、ベースも入ったままです（§2-2）。画面の文言「ベースを解析対象から除外します」は言い過ぎです |
| 2 | ピアノロールの和声コアの表示は、解析で実際に使う見分けと同じ計算 | **分類器は同じだが、同じ結果にならない場合がある。** 対象のパートの決め方と、音の終わりの位置が違います（§2-5）。指示書 Stage 01 §3 の「使えるか」は **条件付きで可** |
| 3 | 「1小節目へ移動」が今の画面にある | **ボタンとしては無い。** 白いバーの現在の小節を示す文言（`n小節目へ移動`）があるだけです（§1-4） |
| 4 | 白いバー（`PreAnalysisTimeScrollbar`）は、全体の帯に置き換える | 白いバー自体が「表示範囲の枠 + 位置」の帯です。**修正作業場の全体の帯は、画面の部品ではなく `CorrectionWorkspace` の中に直接書かれています**（§5-1）。部品として共用はできず、同じ見た目で作ることになります |
| 5 | 4/4 として読む（Stage 03）は今の仕組みで対応できるか調べる | **今は拍子の不自然さを検出も知らせもしません**（§4-1）。直せるかは「できる（セッション側の上書き）」。ただし `isBackwardEquivalentSession` の条件の追加が要ります（§4-1） |
| 6 | Phase 5.1 のプリセット（役割の保存）があれば使う | **保存の仕組みは無い。** 保存されるのは役割の訂正**ログ**（読み取り専用の記録）だけで、画面に再び適用する用途は無い（§4-4） |
| 7 | `melody-weak` の意味 | **画面の「メロディ（弱い証拠）」は、内部の `melody` と `mixed` の両方を指します。** `melody-weak` はコード名の判定にも区切りにも**入ります**（弱く）。`exclude` と違い、音が消えません（§3-2）。Stage 02 §3 の基準を満たすのは **`exclude`** です |
| 8 | 解析に渡る「仮のパート」で元のパートとの対応を持てる | **今の仕組みのままでは切れます。** 解析後の修正作業場・保存されるボイシングは、渡した `trackIndex:channel` を使います（§3-5）。仮のパートを渡すには、対応を別に持つ必要があります |

**Stage 01 の「置き場所」の答え（§2-3）：「コードとメロディが混ざっていたら」は セッション単位でしか変えられません。** パートのカードには置かず、パート一覧の上に 1 つだけ置く案（指示書 §2.1 の後者）になります。

## 1. 今の画面

### 1.1 画面の構成と切り替え

`src/components/pre-analysis/PreAnalysisWorkspace.tsx`（1137 行）。呼び出しは `src/views/CaptureView.tsx` 1 か所（618 行付近）。

| 順 | 部品 | 出る条件 |
| --- | --- | --- |
| 1 | 見出し「MIDI解析 / 読み込んだMIDI」と説明文 | 常に |
| 2 | 右上の操作：パート詳細（開閉）・MIDIを追加・**この構成で解析**・「n Voice中 m Voiceを解析します」 | 常に。解析は `busy` か `includedCount===0` で押せない |
| 3 | 「再解析が必要です」 | 解析済みの結果があるとき（`requiresReanalysis`） |
| 4 | 読み込んだファイルのカード（ファイル名・`SMF n · 時間 · BPM · 拍子 · テンポ変動`） | 常に |
| 5 | **コンパクト表示**の帯「解析対象: X 1パート」 | `detailsExpanded` が偽のとき |
| 6 | **展開表示**：再生の行 → ピアノロール＋白いバー＋ズーム＋表示切り替え（左）／解析プリセット・和声コアの重み・自動推定に戻す・解析するパート（右の欄 380px）→ 確認事項 | `detailsExpanded` が真のとき（`xl` 以上で 2 列。それ未満は縦に積む） |
| 7 | 下の一行「解析対象: 和声 n / ベース n・除外 n」 | 常に（展開の外） |

**コンパクト／展開の切り替え**：初期値は `needsPreAnalysisReview(session) || defaultDetailsExpanded`（`src/storage/preAnalysisSettings.ts`）。次のどれかなら展開：
複数ファイル／ドラム以外のパートが 2 つ以上／音色番号 0〜23（ピアノ・オルガン等）のパートが有る／ドラムが有る／`melody-weak` の自動役割が有る／自動役割の信頼度が低い（`<0.45`）／確認事項が有る／SMF 0 で複数チャンネル。
→ **ピアノ（音色 0〜23）のパートが 1 つだけの MIDI でも、展開表示になります**（推測：「簡単な MIDI」の多くはここで畳まれない。Stage 03 §3 の畳み表示の条件と衝突します。§4 参照）。
利用者が開閉すると `onDetailsExpandedChange` で `CaptureView` の状態に覚えます（保存はしない）。

### 1.2 画面の操作と `AnalysisSession` への影響

| 操作 | 実体 | 変わるもの |
| --- | --- | --- |
| 解析プリセット 5 つ | `applyAnalysisSessionPreset` | `preset`、全 `voices` の `assignedRole` / `included` / `solo`（下の表） |
| 和声コアの重み（標準／和声コア） | `setAnalysisSessionVoiceContributionPreset` | `session.voiceContributionPreset`（**セッションに 1 つ**） |
| 自動推定に戻す | `resetAnalysisSessionAuto` = `preset("auto")` | 同上（`auto` と同じ） |
| パートの「解析対象」チェック | `updateVoice({included, assignedRole})` | その voice の `included`（外から入れるときは `assignedRole` が `exclude` なら自動役割に戻す）。`preset` が `custom` になる |
| パートの役割の選択（和声／ベース／メロディ（弱い証拠）／除外） | `updateVoice({assignedRole, included: assignedRole!=="exclude"})` | その voice の `assignedRole` と `included`。`preset` が `custom` |
| S（ソロ） | `onSessionChange` で全 voice の `solo` を更新 | `solo`（1 つだけ）。**解析には渡らない**（試聴用） |
| ミュート／表示（パートごと・ファイルごと） | `updateVoice`／`updateAnalysisSessionSource` | `muted`／`visible`。**解析には渡らない** |
| ファイルの削除 | `removeMidiSource` | `sources`・`voices`・`notes`・`controlChanges`。master を消すと先頭が master に |
| MIDI を追加 | `addMidiSources`（`CaptureView.chooseMidi(true)`） | 同上＋重複検出・タイムライン警告の再計算 |
| 表示 解析対象／全Voice | 画面の `useState` のみ | **セッションに影響しない** |
| ズーム・追従・再生位置・表示範囲 | 画面の `useState` のみ | 同上 |
| パート詳細の開閉 | 画面の `useState`＋`CaptureView` の状態 | 同上 |

### 1.3 解析プリセット 5 つ（`applyAnalysisSessionPreset`）

| プリセット | `assignedRole` | `included`（ドラム・重複を除く） |
| --- | --- | --- |
| `auto`（おまかせ） | 全 voice を `autoRole` に戻す | `autoRole !== "exclude"` |
| `harmony-bass`（和声＋ベース） | **変えない**（今の役割のまま） | 今の役割が `harmony` か `bass` |
| `accompaniment-only`（伴奏のみ） | 変えない | 今の役割が `harmony` |
| `all-pitched`（全パート） | 変えない | **全部** `true`（役割が `exclude` でも） |
| `custom` | 変えない（`preset` だけ `custom` に） | 変えない |

共通：ドラムは必ず `exclude`・`included:false`。重複（`duplicateOf`）は `included:false`。`solo` は全部 `false` に戻る。

**食い違い（読んだ結果。実際には動かしていません）**：`all-pitched` は `assignedRole` が `exclude` のパートも `included:true` にしますが、解析に渡す選び方（`analyzerInput.isSelectedVoice`）は `assignedRole !== "exclude"` も要求します。画面の「n Voice を解析します」（`included` の数）と、実際に解析に渡るパートの数が、`exclude` のパートがある曲でずれます。**今の挙動を変えない**方針なので、新しい画面では要約の帯に出す数を、実際に渡るパート（`isSelectedVoice`）で数えることを提案します（Stage 01 §5 の「実際にどう扱われるか」に必要）。

### 1.4 「表示 解析対象／全Voice」「パート詳細」「白いバー」「1小節目へ移動」「追従」

| 項目 | 中身 |
| --- | --- |
| 表示 解析対象／全Voice | `PianoRollDisplayScope`（画面の状態のみ）。「解析対象」は `isPianoRollAnalysisTarget`（`included` かつ `assignedRole≠exclude`、ドラム以外）のパートの音だけを描く。「全Voice」は `visible` なパートを全部描く。**どちらも描画だけ**で、解析に影響しない |
| パート詳細 n Voice ▾ | コンパクト／展開の切り替えボタン（§1.1）。`aria-expanded` |
| 白いバー | `PreAnalysisTimeScrollbar.tsx`（141 行）。横の帯（高さ 24px）に「表示範囲の枠（`pre-analysis-visible-range`）」と「位置の白い線（`pre-analysis-time-cursor`）」。ドラッグ／クリックで位置を動かす。キー：←→（拍/小節）・PageUp/Down・Home/End。`role=slider`。**帯の中に音は描いていない** |
| 1小節目へ移動 | **ボタンは無い。** 帯の上の文言 `n小節目へ移動`（`aria-valuetext`）が、現在の小節を示すだけ |
| 追従 | チェック。再生中に表示範囲を位置に合わせて動かす（`viewportStartForBeat`） |
| ロールの操作 | キャンバスのクリック／ドラッグで再生位置、←→で表示範囲、Home、音のクリックでパート選択。**Ctrl+ホイールのズームは無い**（ズームはスライダー 1〜8 のみ） |

## 2. 和声コア

### 2.1 `harmonic-core` で解析の入力がどう変わるか

事実（`analyzerInput.ts`・`voiceAwareReranker.ts`・`voiceProfiles.ts`）：

1. `buildSessionAnalysisRequest` は、`voiceContributionPreset === "harmonic-core"` のとき `mode: "voice-aware-rerank-v1"` を付け、`analysisInput.voiceContributionPreset` に `"harmonic-core"` を入れる。標準のときは**どちらも付けない**（既定のモード `defaultAnalyzerMode`）。
2. 役割の上書き（`roleOverrides`）：`harmonic-core` のときは、**「画面で役割を変えていないパート」は上書きしない**（アプリ自身の推定のまま）。変えたパートだけを上書きする。標準のときは、ドラム以外の全パートに `assignedRole` を上書きとして渡す。
3. `voice-aware-rerank-v1`：まず従来の解析（`analyzeMidiWithRankingScores`）で区切りと最初の和音の候補を作り、各区間を**パートの役割で重み付けした音の証拠**で採点し直す。
4. 役割ごとの重みの掛け算（`harmonicCoreRoleWeights`）：ベース 0・和声 1.3・パッド 1.3・メロディ 0.15・打楽器 0・混在 0.8。`harmonic-core` のときだけ掛ける。
5. 和声・パッド・混在のパートでは、さらに**音ごとの重み**（`buildHarmonicCoreNoteWeights`＝`noteTextureClassifier`）が掛かる。

### 2.2 ベースのパートは本当に外れるのか

**事実：再採点の証拠からは外れる。従来の解析の区切りと最初の候補には残る。**

- 外れる所：`buildVoiceAwarePitchProfile`（`voiceProfiles.ts`）。役割の寄与が全部 0（`isZeroContribution`）の音は `continue` される。`harmonic-core` ではベースの重み 0 なので、**ベースのパートの音は再採点の証拠に一切入らない**。
- 残る所：`analyzeMidiVoiceAwareRerank` は先に `analyzeMidiWithRankingScores(bytes, options)`（従来の解析）を走らせ、その `fullTimeline`（区切り・最初の和音）を土台にする。従来の解析では、ベースのパートの重みは **1.5**（`roleFactor`）で、低い音（60 未満）は低音の証拠にもなる。**ここにはベースが入っている。**
- 結果として：和音の**区切り位置**はベースを含む従来の解析で決まり、**和音の名前**はベースを除いた証拠で採点し直される。再採点の証拠にベースが無いので、スラッシュコード（ベース指定）の判定も弱まる（`normalizeVoiceAwareScores`：低音の証拠が 0 なら、ベースの適合の点を引く）。
- 要約の帯の書き方の提案：`ベース: Bass（アプリに任せる設定では、和音の名前の判定には使いません）`。「解析には使いません」とは書かない。

### 2.3 パートごとに変えられる余地があるか

**無い（セッション単位）。**

- `voiceContributionPreset` は `AnalysisSession` に 1 つだけ（`types.ts`）。解析の入力 `AnalysisInput.voiceContributionPreset` も 1 つで、`buildAnnotatedVoiceRoleProfiles(voices, overrides, preset)` が全パートに同じ値を使う。
- 「パートごとに別の値」を渡すには `voiceProfiles.ts`／`voiceAwareReranker.ts` の中（検出ロジック）を変える必要がある。指示書 §3-1 に反するので**やらない**。

→ **答え：セッション単位。** 指示書 Stage 01 §2.1 の後者「パート一覧の上に 1 つだけ置く。パートのカードには出さない」。

補足（推測）：この選択は、解析のモード（`voice-aware-rerank-v1` か既定か）も切り替える。見た目は「コードとメロディが混ざっていたら」の 2 択だが、中身は**解析のしくみ全体の切り替え**なので、言葉は「アプリに任せる」でよいが、説明に「解析のしくみ自体が変わります」と添えるのがよい。

### 2.4 同じパートの中の「和声／メロディ寄り」の見分け

事実（`harmonicCoreNoteWeights.ts`・`noteTextureClassifier`・`noteTextureFeatures`）：

- 対象のパート：役割が `harmony`／`pad`／`mixed` のパートの音（ドラムのチャンネル 9 を除く）。
- 音ごとの特徴（`extractNoteTextureFeatures`）：その音が局所的な最上声か・下に何音支えがあるか・下の和音の長さに対する長さ・独立した発音か・最上声の連続性・順次進行・持続の保護など。
- 分類（`classifyNoteTextureFeatureSet`）：`harmonic`／`melody-like`／`uncertain` と、音ごとの掛ける重み（`proposedMultiplier`、0 より大きい）。**音は消さず、重みだけが変わる。**

**境目の線の最初の位置の提案に使えるか（推測）**：使える。`melody-like` と分類された音の音高の分布（たとえば下から 20 パーセンタイル）から、線の最初の位置を決められる。ただし：
- 分類は**音ごと**で、音高の高さでは決まらない。同じ音高でも曲の場所によって `harmonic` にも `melody-like` にもなる。**線は「高さ」で分ける簡易的な方法**なので、提案の位置は「`melody-like` の音の最低音の少し下」のような近似になる。
- 分類の対象は `harmony`／`pad`／`mixed` のパートだけ。画面で `melody-weak` のパートは `mixed` を含むが、`melody` のパートは対象外。
- 指示書の代替案（「その高さより上の音の 80% 以上が単音になる、いちばん低い高さ」）は、分類器に依存せず、画面の側だけで計算できる。**どちらも画面の側（解析の中身には触れない）で作れる。**

### 2.5 ピアノロールの和声コア表示は、解析と同じ計算か

**分類器は同じ。結果が同じとは限らない。** 違いは 2 つ（`PreAnalysisPianoRoll.harmonicCorePianoRollNotePreview` と `harmonicCoreNoteWeights.buildHarmonicCoreNoteWeights` の比較）：

| | 表示（ピアノロール） | 解析 |
| --- | --- | --- |
| 対象のパート | 画面の役割が `harmony`・`included`・ドラム以外 | **アプリが推定した役割**が `harmony`／`pad`／`mixed`（`harmonic-core` で画面の役割を変えていないパートは、上書きされずに推定のまま） |
| 音の終わり | `startBeat + durationBeats` | `sustainedEndBeat`（ペダルで伸ばした終わり） |

結果としてのずれ（読んだ結果。実測はしていません）：
- 「メロディ（弱い証拠）」と表示されるが、中身は `mixed` のパート：**解析では音ごとの重みが掛かるのに、表示では掛からない**（表示は `harmony` だけを見ているため）。
- ペダルを多く使う曲：音の長さの特徴が違うので、`harmonic`／`melody-like` の境目が変わる音が出る。

→ 指示書 Stage 01 §3：「今の表示が使える場合」は**使える。ただし「解析と完全に同じ」とは書かない**。簡易な対処として（解析の中身に触れずに）、表示の対象を「解析と同じ条件（アプリの推定が `harmony`／`pad`／`mixed`）」に揃えることは画面側でできる（`sustainedEndBeat` は `PreAnalysisNote` に無いので、**ペダルの違いは揃えられない**）。揃えるかは承認を取りたい点です。

## 3. 境目の線の前提（Stage 02）

### 3.1 仮のパートに分けて渡せるか

事実：`buildPreparedMidiSongData(session, selectedVoices)` は、選んだパートの**並び順**を `trackIndex`（0, 1, 2, …）として振り直し、`tracks[]` に 1 パート 1 エントリ（`channel`・`program`・`roleOverride`）を作る。`controlChanges` も同じ `trackIndex` に付け替える。

- 分けて渡すことは**できる**：`selectedVoices` の代わりに「仮のパート」（元のパートの音の部分集合）を渡し、音を `trackIndex` ごとに振り分ければよい。`channel` は元のまま（`voice.channel`）にできる。
- `trackIndex` はそもそも 0 からの連番で、**複数ファイル・複数パートでも重ならない**（`voiceOrder`）。仮のパートも同じ連番に入れればよい。
- 役割：`trackRoleFor(assignedRole)` で `tracks[].roleOverride` を決める（`harmony`／`bass`／`melody`）。仮のパートごとに指定できる。`buildPreparedAnalysisInput` の `roleOverrides`（`sanitizeVoiceRoleOverrides`）は `voiceId(index, channel)`＝`${index}:${channel}` で作る。**同じ `channel` の 2 つの仮のパートも `index` が違うので別の voice になる**。
- 注意：`harmonic-core` のとき、「画面で役割を変えていないパートは上書きしない」条件（`voice.assignedRole === voice.autoRole`）が、仮のパートでは意味を持たない。仮のパートには必ず上書きを渡す（Stage 02 §4 の「役割の上書きが、線で決めた役割を消さない」）。

### 3.2 `melody-weak` は解析でどう扱われるか

画面の「メロディ（弱い証拠）」の内部（`preAnalysisRoleFromProductRole`）：製品の役割 `melody` **と `mixed`** の両方がここに入る（`bass`→ベース、`harmony`・`pad`→和声、`percussion`→除外）。画面から渡すときは `melody-weak` → `melody`（`voiceRoleFor`／`trackRoleFor`）。

| 問い | 答え |
| --- | --- |
| **コード名の判定に入るか** | **入る（弱く）。** 標準：従来の解析で `roleFactor(melody)=0.5`（和声 1.3・ベース 1.5・混在 1.0）。和声コア：`melody` の寄与に 0.15 を掛ける（根音 0.15×0.15、質 0.22×0.15、テンション 0.35×0.15）。さらに 60/55 未満の低い音は、寄与が 0 でなければ低音の証拠（0.65〜1）にもなる |
| **区切りの判定に入るか** | **入る。** 従来の解析の窓の集計（`buildWeightedWindows`）に、重み 0.5 で入る。窓の `melodyWeight / totalWeight > 0.45` なら `melody-heavy` の警告になる（和音の名前そのものは変えない） |
| **保存されるボイシングに入るか** | **入りうる。** 解析後のボイシングの抽出（`extractAggregatedNoteSet`）は、メロディの役割の音の重みを 0.2（和声 1、ベース 0.8、パッド 0.65）にして集計する。**音は残る**（`melodyContaminationFilter` が有効な場合は、条件を満たす上の音が落とされる）。解析に渡された音のうち、除外されたパートの音はそもそも渡らない |
| **`exclude` との違い** | `exclude` のパートは `isSelectedVoice` で**解析に渡らない**。音が `preparedData` に入らないので、コード名にも区切りにも使われない。**さらに、解析後の修正作業場・保存されるボイシングの元データ（`sourceData` = `preparedData`）にも入らない**（§3.5） |

→ **Stage 02 §3 の基準（「線より上の音が、コード名の判定に入らないこと。音そのものは消さないこと」）を同時に満たす役割は、今のコードに無い。**
- `melody-weak`：音は消えないが、コード名の判定に弱く入る。
- `exclude`：コード名の判定に入らないが、**音が解析後の画面・保存からも消える**。

提案（承認を取りたい点）：
  a. **`melody-weak` を使う**（コード名の判定に弱く入ることを、画面に正直に書く。「メロディとして扱う（和音の判定には弱く効く）」）。**Stage 02 の「分けたことの効果」は、和声コアと合わせたときにもっとも大きい**（0.15 倍）。
  b. `exclude` を使い、画面に「この音は解析の結果の画面にも出ません」と書く（音が消えるので「音は落とさない側に倒す」方針に反する）。
  c. 解析の中身（役割の種類）を増やす → **指示書 §3-1 に反するのでやらない**。

私の推奨は a。ただし a は「基準を満たしていない」ので、Stage 02 §3 の基準そのものを「弱い証拠として入る（標準で 0.5 倍・和声コアで約 0.15 倍）」に改めるか、b にするかの承認が要ります。

### 3.3 `isBackwardEquivalentSession` が偽になるか

偽にできる。条件：`sources.length===1` かつ `preset==="auto"` かつ `voiceContributionPreset==="standard"` かつ警告に `exact-duplicate` が無い かつ **全パートが `duplicateOf` 無し・`assignedRole===autoRole`・`included===(!isDrum && autoRole!=="exclude")`**。

- 線のあるセッションを偽にするには、（a）仮のパートを `AnalysisSession` に持たせて `voices` を変える、または（b）`isBackwardEquivalentSession` に「線が有る」の条件を足す。**どちらも `analyzerInput.ts` の変更**で、解析の中身ではない。
- **（b）が小さい変更。** 線を持つパートがあるセッションは、`preset`・役割が自動のままでも `true` にならないようにする（`custom` に落とす方法もあるが、それだと訂正ログの `preset` が `custom` になる＝**ログの意味が変わる**ので避ける）。

### 3.4 役割の訂正ログに仮のパートがどう記録されるか

事実（`roleCorrectionLog.ts`）：ログは `session.voices` を 1 パート 1 イベントで作る（`autoRole`・`assignedRole`・`channel`・`noteCount`・音域など）。**パートの id・`trackIndex` はログに入らない**（`schemaVersion:1`、`.strict()`）。

→ 仮のパートを `session.voices` に入れず（解析の入力を組み立てる時だけ作る）、線は `session` の別のフィールドに持てば、**ログの形は変わらず、仮のパートの id はログに出ない**。形を変えずに済む。
ただし、ログは「線で分けた」ことを記録できない（`manuallyChanged` は `assignedRole!==autoRole` だけ）。線を使った事実をログに残したいなら形を変えることになる（**指示書 §3-6 に反する**ので、残さない）。

### 3.5 元のパート（`voiceId`・`trackIndex`）が使われている箇所と、対応が切れる箇所

事実：

- 解析後：`vaultStore.analyzeMidiBytes`（`src/store/vaultStore.ts` 750 行付近）は `sourceData = analyzeOptions.preparedData ?? parseMidi(bytes)` とし、`sourceVoices = annotateVoiceRolesV2(buildVoices(sourceData), …)`。**修正作業場・保存されるボイシング（`attachSourceVoicings`）は、渡した `preparedData` をそのまま元データとして使う。** 元のファイルの音（`master.bytes`）ではない。
- 修正作業場（`correctionModel.ts`）は、音を `trackIndex:channel` で `sourceVoices` に引き当て、メロディの Voice の名前を `voice.trackName || "トラック{trackIndex+1}"` と出す。`preparedData.tracks[].name` は常に空文字なので、**`トラック1`・`トラック2` と出る（渡した連番）。元のファイルのトラック番号ではない**（今も同じ。指示書のテスト 11 とは別の既存の挙動）。
- 切れる箇所：仮のパートを渡すと、修正作業場の「メロディの Voice」「Voice の役割」は**仮のパートの連番**で出る。元のパート（画面の「Piano」）との対応は画面に出ない。
- 対応を持つ方法（推測）：仮のパートの `trackIndex` とは別に、`sourceVoices` の対応表（仮の `trackIndex` → 元の `voiceId`）を `analysis` の状態に持てば、修正作業場の表示の側で元のパート名に直せる。**今の `analyzeMidiBytes` の戻りの形を変えない**範囲で足せるか（`sourceVoices` は `Voice[]` で、元の id を入れる場所が無い）は、実装の前に決める必要がある。

## 4. 知らせ・記憶（Stage 03）

### 4.1 拍子が 1/4 などのとき

- **知らせは無い。** `AnalysisSessionWarningCode` に拍子の不自然さは無い（`tempo-map-mismatch`／`time-signature-mismatch`＝**master と追加ファイルの食い違い**／`duration-mismatch`／`start-position-mismatch`／`exact-duplicate`／`near-duplicate`）。**単独のファイルの拍子が不自然でも出ない。**
- 画面の `sourceSummary` は拍子を `n/m` で出す（1/4 ならそのまま `1/4`）。
- 解析への渡し方：`buildPreparedMidiSongData` が `master.timeSignatures[0]` を `timeSignature` と `totalBars`（`ceil(durationBeats / beatsPerBar)`）にする。`beatsPerBar("1/4")=1`。したがって 1/4 のままだと、1 小節 1 拍で数える。
- **「4/4 として読む」はセッション側で作れる（推測）**：`AnalysisSessionSource.timeSignatures` を `[{beat:0, numerator:4, denominator:4}]` に置き換える（元のバイト列は変えない）。`buildPreparedMidiSongData`・ピアノロールの小節線・白いバー（`sessionBeatsPerBar`）がこの値を読む。
  - **条件**：何も変えていないセッションは、従来の経路（`master.bytes` をそのまま解析）に流れ、**セッションの拍子の上書きは無視される**。上書きしたときは `isBackwardEquivalentSession` が偽になる条件を足す必要がある（`analyzerInput.ts` の変更。解析の中身ではない）。
  - **注意**：準備した経路（`preparedData`）と、バイト列の経路では、解析結果が同じとは限らない（それが `isBackwardEquivalentSession` がある理由）。「4/4 として読む」を押した結果が、4/4 と書かれた同じ MIDI のバイト列経路の結果と一致するかは、**実装の前に既存の fixture で比べる必要がある**（今回は測っていません）。
- 提案：Stage 03 で「4/4 として読む」を入れる場合は、上の比較を先に行う。比べて差があれば、「このまま」と知らせだけに留める。

### 4.2 テンポの揺れの表示

- `hasRobustTempoVariation(diagnostics)`（`tempoAnalysis.ts`）：`weightedP05Bpm` と `weightedP95Bpm` があり、`P95 / P05 >= 1.2` のとき真。
- 文言（`PreAnalysisWorkspace.tempoVariationLabel`）：`テンポ変動あり {P05}〜{P95} BPM`。ファイルのカードの 1 行（`SMF · 時間 · BPM · 拍子 · …`）に出る。代表値の BPM は `representativeBpm`（時間で重み付けした中央値）。

### 4.3 ドラムの扱い

- `isDrum = (channel === 9)`。`updateAnalysisSessionVoice`・`applyDuplicateGuard` は、ドラムを必ず `assignedRole:"exclude"`・`included:false` に固定する（手動の更新も効かない）。
- 画面：ドラムのチェックと役割の選択は無効。ドラムの理由を示す文言は**今は無い**（`autoRoleEvidenceKinds` の `channel-10`＝「Channel 10」が小さなバッジで出るだけ）。指示書の「ドラム（10チャンネル）なので使いません」は新規。
- 自動の見立てで `exclude` になる**ドラム以外**のパート：`preAnalysisRoleFromProductRole` は製品の役割 `percussion` だけを `exclude` にする。チャンネル 10 以外でも、役割の推定（`voiceRoleV2ShadowClassifier.applySoftPercussionEvidence`）が「打楽器の音色番号」「トラック名のヒント」「短く密で狭い音域」のうち **2 つ以上**そろうと `percussion` と推定する。その場合は `autoRole:"exclude"`・`included:false` になり、`isDrum` は偽（＝役割の選択は有効）。理由の表示は `autoRoleEvidenceKinds` の `percussion-soft-signature`（「打楽器傾向」）などのバッジだけ。新しい画面で「自動で使わない」理由を 1 行出すには、この証拠の種類から文を作る（ドラムは `channel-10`）。

### 4.4 Phase 5.1 のプリセット（役割の保存）

- **役割を保存して再現する仕組みは無い。**
- 有るもの：`roleCorrectionLogStorage.ts`（役割の訂正ログ。`appendRoleCorrectionLog`）。**追記専用の記録で、再適用の用途は無い。** ファイル名・トラック名・音の中身は入らない（`roleCorrectionLog.ts` のスキーマに無い）。
- `preAnalysisSettings.ts` の保存は `enablePreAnalysisSourceSelection`・`alwaysShowPreAnalysis` の 2 つの真偽値だけ。
- → Stage 03 の「前回と同じ設定」は**新規**。「Phase 5.1 のプリセットを使う（2 つ作らない）」の対象は無い。

## 5. 部品の共用（Stage 01）

### 5.1 修正作業場の「全体の帯」を使えるか

- **部品としては使えない。** `CorrectionWorkspace.tsx` の 960〜985 行に直接書かれている（`lv-cw-overview-row`／`lv-cw-overview`）。中身は `present.cards`（和音のカード）・`shown.segments`（区切り）・`saveRange`・`reviewCards` に依存し、ドラッグは `overviewRef` と `moveFromOverview`（同じファイル内）。
- 共用するには、帯を切り出して「表示範囲 / 位置 / 全体の長さ / 中に描くもの（音の薄い点か、和音のカードか）」を受け取る部品にする必要がある。**`CorrectionWorkspace` の変更を伴う**（既存の画面に手を入れる）。
- 提案：まず**同じ見た目・同じ操作の帯を、取り込み前の確認の側に作る**（CSS クラス `lv-cw-overview*` の見た目は共用できる）。部品の切り出しは、承認を取ってから別の作業にする。
- 今の `PreAnalysisTimeScrollbar` は、同じ「表示範囲の枠 + 位置」を持つ。**音を薄く描く**（見本の全体の帯）のは新規。

### 5.2 ピアノロールの描画方式

- `PreAnalysisPianoRoll.tsx`：**Canvas**（高さは固定 290px。幅は親の幅）。音ごとに `fillStyle` を決めて描くので、**音ごとに色を変えられる**（役割の色・「アプリに任せる」の濃淡・線の上下の色）。
- 表示する音域は `min(音, 48) − 2` 〜 `max(音, 72) + 2`（**最低でも 48〜72 を含む**）。指示書の「使われている音の範囲 ±2」にするには変更が要る。
- 1 段の高さ = `noteHeight / pitchCount`（290px 固定の中で割る）。**指示書 §1.1 の「6〜16px・ロールの高さに合わせる」は、キャンバスの高さを窓から決める変更が要る。**
- 当たり判定（クリックで voice を選ぶ）を持つ（`hitAreasRef`）。
- 再描画は `ResizeObserver`（親要素の幅の変化）で行う。高さの変化には今は反応しない。

### 5.3 文言に依存している既存のテスト

| ファイル | 依存している文言・属性 |
| --- | --- |
| `src/components/pre-analysis/PreAnalysisWorkspace.test.tsx` | `読み込んだMIDI`（30 行）、`この構成で解析`（515 行）。ほか `data-analysis-preset`・`data-analysis-contribution-preset`・`data-pre-analysis-mode`・`pre-analysis-*` の testid |
| `src/views/CaptureView.preAnalysis.test.tsx` | `pre-analysis-workspace`・`pre-analysis-analyze`・`data-pre-analysis-mode`・`data-analysis-preset="custom"` |
| `src/components/pre-analysis/PreAnalysisTimeScrollbar.test.tsx` | 白いバーの testid（`pre-analysis-time-scrollbar` 等）。白いバーを置き換えるなら消える |
| `e2e/capture-flow.spec.ts` | `pre-analysis-workspace`・`pre-analysis-analyze`・`pre-analysis-piano-roll`・ボタン名 `/パート詳細/` |
| `e2e/keyboard.spec.ts` | ボタン名 `/パート詳細/`・`[data-analysis-preset="custom"]`・`pre-analysis-analyze` |
| `e2e/correction-workspace*.spec.ts`・`e2e/helpers/app.ts`・`e2e/p5-26-1-ui-fixes.spec.ts`・`e2e/p5-26-2-overview.spec.ts`・`e2e/visual.spec.ts`・`scripts/p89/capture-screens.pw.ts` | `pre-analysis-analyze`（解析を押す入口。**testid を残せば影響が小さい**） |

提案：`data-testid="pre-analysis-analyze"`・`pre-analysis-workspace` は新しい画面でも使い続ける（入口の e2e を壊さない）。`パート詳細` のボタンは廃止なので、`capture-flow`・`keyboard` の 2 つの e2e は直す。

## 6. 確認が要る点（承認を取りたいもの）

| # | 内容 | 私の推奨 |
| --- | --- | --- |
| 1 | 「コードとメロディが混ざっていたら」の置き場所 | **パート一覧の上に 1 つ**（セッション単位。§2-3） |
| 2 | 「アプリに任せる」の説明と要約の文言 | 「和音の名前の判定からベースを外し、メロディ寄りの音を弱く見ます。区切りの位置はベースも見ます」 |
| 3 | 「アプリに任せる」の表示（濃淡）を、解析と同じ条件に揃えるか（§2-5） | 揃える（アプリの推定が `harmony`／`pad`／`mixed` のパート）。ペダルの違いは残るので「目安」と書く |
| 4 | 線より上の音の役割（§3-2） | `melody-weak`（コード名に弱く効くと正直に書く）。基準の書き換えの承認を取る |
| 5 | 「4/4 として読む」を入れるか（§4-1） | 実装の前に、バイト列経路と準備した経路の結果を fixture で比べ、一致するなら入れる |
| 6 | 全体の帯の共用（§5-1） | 取り込み前の側に同じ見た目で作る。部品の切り出しは別の作業 |
| 7 | 今の挙動（`all-pitched` が `exclude` を取りこぼす）を要約の数に反映する（§1-3） | 要約は実際に渡るパートで数える（動きは変えない） |
| 8 | ブランチ・フェーズ番号 | `feat/p15-import-check`（指示書「フェーズ番号は仮」。`P15` は他で使っていないことを確認済み：`docs/` に `phase15` は無い） |

## 7. 受け入れ基準（指示書 Stage 00 §7）

- [x] 製品コードを一行も変更していない（変更は本報告 1 ファイルのみ）
- [x] §1〜§5 すべてに回答している
- [ ] 報告後に停止し、承認を待っている → **停止します**
