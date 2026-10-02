<!-- phase-id: 11.0 -->

# P11-13d — Reserved Holdout Final Evaluation

## A. Frozen Policy

**判定: `HOLDOUT_CONFIRMED`。`READY_FOR_HUMAN_DECISION`で停止。** 確認できた範囲は既存public synthetic offsets6..11。製品採用や独立ergonomic Goldによる検証ではない。

最終policyは **E1-T / 既存P11-13b Hand Position / inverse / λ=2 / weak Common Tone reassignment penalty γ=1**。同じ手・同じMIDI pitchのfinger変更に1を加算する。candidate generator/cap、Proxy、Saved Anchor、Segment Solve、Empty-hand handling、cyclic DP、tie-break、Range、notes、hand assignmentを変更しなかった。

比較は **CURRENT / λ2 / λ2+γ1の3armのみ**。他のλ/γ/curveは実行していない。devで選んだ値をそのまま使用し、結果後の実装修正・parameter tuning・再評価はない。

判定・代表選出・性能の重大退行基準は、結果を見る前に [RESERVED-EVALUATION-CONTRACT](../../../scripts/p11-13/RESERVED-EVALUATION-CONTRACT.md) としてcommit **`9ca9b7ca`** で固定。評価器追加は **`90ff4549`**。今回の差分は診断スクリプトと文書のみで、製品rankerやCommon Tone costModel、shared metrics本体は不変。実行前にP11-13c provenanceのsource SHAすべてが一致することを確認した。

## B. Reserved Dataset / Provenance

| 項目 | 値 |
| --- | --- |
| Corpus ID / version | p11-13-public-synthetic-v1 / 1 |
| Split | reserved-offsets6..11 |
| Cases / events | **1,080 / 4,320** |
| Hands / cardinality / IOI | LH/RH、1〜5音、0.25 / 1 / 4 beats（BPM120） |
| Family | white / black / cluster / wide / inversion / open、各180case |
| Manifest SHA | 77453a66b178efd1ce4166226aea7391503af9f0635af1e777d66ffa461b704e |
| Tested code HEAD | **90ff45497e32a4fb6e5b0f62f3f0cb1d0241bb9a** |
| Scoring contract / metric version | p11-13-properties-v1 / common-tone-followup-v1 |
| Policy ID | e1t-inverse-lambda2-common-tone-gamma1-v1 |
| Boundary / identity | authored-onsets / authored-or-absent-fixed |
| Snapshot / hand | public-authored-notes / fixed-input-hand |
| Dev comparison | P11-13c code HEAD da0b3266の保存結果を読み取り。再計算・再調整なし |

**過去のreserved exposureについてGit/既存artifactと指示の前提に差がある。** P11-13bの `comparison.ts` と元artifactには、HEAD `2d29ac97` の **inverse / λ0.5** 等のreserved評価1,080caseが既に存在する。したがってoffsets6..11を「これまで一度も評価していない新規holdout」とは扱えない。今回はP11-13cでdev選択した **λ2+γ1の初回固定確認**であり、新規完全未使用holdoutによる最終promotionの証明ではない。以前の数値で今回のpolicyを選び直していない。

評価entry pointは開始markerを排他的に作成し、開始済み・結果ありなら再実行を拒否する。今回の呼び出しは1回、完了markerあり。mandated deterministic duplicate、Anchor、Range、time/context control、runtime反復はその1回内のproperty測定でありpolicy再挑戦ではない。

全結果・source SHA・元artifact SHAはlocal-onlyの `.local-evaluation/p11-13/reserved-final/comparison.json` に保存。全caseのfinger列は `cases.json`、実行記録は `started.json` / `finished.json`。Gitには入れない。private MIDI/Vault、外部Fingering Datasetは未使用。

## C. Structural Properties

| Property | CURRENT | λ2 | λ2+γ1 |
| --- | --- | --- | --- |
| candidate-empty / solver / structural failure | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| notes / candidates 不変 | 1080/1080 / 1080/1080 | 1080/1080 / 1080/1080 | 1080/1080 / 1080/1080 |
| hands 不変 | 1080/1080 | 1080/1080 | 1080/1080 |
| deterministic | 1080/1080 | 1080/1080 | 1080/1080 |
| Saved Anchor | 4320/4320 | 4320/4320 | 4320/4320 |
| repeat fluctuation | 0 | 0 | 0 |
| Range / input invariance | 9/9 | 9/9 | 9/9 |

新candidate/solver/structural failureは0。手の不変性は固定inputの不変性と各resultのL:/R: signatureを全caseで確認した。Saved sweepは各eventを同じ既存last candidateへ固定するため、Anchorの強制保持を直接測定している。

Rangeは事前選出9caseを実 `rankPracticeHandFingerings` adapterへ入力し、全体入力のままfirst-only / middle-to-lastのsession Range metadataを付けても同じ結果になることを確認した。全3armで各9/9、入力notes/handsも不変。自由なRange境界を新たに最適化するテストではない。

fresh focused **17/17 PASS**（既存Common Tone5、foundation4、Hand Position5、View3）。segment barrier、empty-hand経過時間、Saved Anchor、Rangeも含む。diagnostic TypeScript / evaluator ESLint PASS。全てtested HEAD `90ff4549`。FULL / EXEは未実行。過去FULLを今回HEADのPASSとして流用していない。

### Time / Context

| Control（LH/RHそれぞれ） | λ2選択変化回数 | γ1選択変化回数 | 方向 |
| --- | --- | --- | --- |
| single | 2 | 2 | 維持 |
| cluster | 2 | 2 | 維持 |
| open | 2 | 3 | 維持 |
| inversion | 2 | 3 | 維持 |

LH/RH single-note controlsはbase42/66、IOI0.03125〜16秒。Common Tone controlsはreservedのoffset6、2-note cluster/open/inversion、IOI0.125〜4秒。全probeでIOI増加時のpreferred deviation非増加 / proxy movement非減少を維持し、λ2で選択が変わる全probeがγ1でも時間感応を維持した。

Contextは同じbase42/66で中央pitchを固定し、前後だけ変えた14control。CURRENT 0/14、λ2 **8/14**、γ1 **8/14**で中央fingerが変化した。devの10/14とは異なるpitch contextであり、同一入力の回帰差とは扱わない。これらderived controlsはcorpus1,080caseの分母に混ぜない。

## D. Common Tone Reserved Result

| Arm | 保持 | 変更 | 改善case | 退行case | 増change | 減change |
| --- | --- | --- | --- | --- | --- | --- |
| CURRENT | 1080 | 2124 | 0 | 0 | 0 | 0 |
| E1-T | 1118 | 2086 | 40 | 18 | 18 | 56 |
| CT=1 | 1200 | 2004 | 118 | 18 | 18 | 138 |

common-pitch comparisonsは全3arm **3,204**、cyclic wrapを含む。改善/退行case・増/減changeはCURRENTを基準とする。γ1はλ2より変更を **82減少（約3.93%）**。改善case40→118、退行caseは **18→18**。退行case数の改善は観測せず、再割当総数と改善case数で効果が一般化した。

18件はλ2とγ1で同じcase集合で、すべてcluster。λ2で退行していなかったcaseに新規退行は **0**。cluster内の変更数も234→234であり、γ1がこの残存退行を直したとは報告しない。Common Tone finger列は演奏Goldではなく、複数の合理的運指を許す内部診断。

## E. Dev vs Reserved

| Metric | Dev λ2 | Dev λ2+γ1 | Reserved λ2 | Reserved λ2+γ1 |
| --- | --- | --- | --- | --- |
| Cases | 1148 | 1148 | 1080 | 1080 |
| Events | 4478 | 4478 | 4320 | 4320 |
| Common comparisons | 3308 | 3308 | 3204 | 3204 |
| Reassignment | 2122 | 2026 | 2086 | 2004 |
| Proxy movement | 9670.5 | 9436.5 | 9669.5 | 9440.5 |
| Cyclic wrap movement | 3355 | 3290 | 3370.75 | 3310.25 |
| Repeat fluctuation | 0 | 0 | 0 | 0 |
| 同finger保持 | 1186 | 1282 | 1118 | 1200 |
| 変更率 | 64.15% | 61.25% | 65.11% | 62.55% |
| 改善case / 退行case (vs CURRENT) | 40 / 24 | 112 / 18 | 40 / 18 | 118 / 18 |
| 増change / 減change | 30 / 72 | 18 / 156 | 18 / 56 | 18 / 138 |
| candidate / solver / structural failure | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Anchor保持 | 4478/4478 | 4478/4478 | 4320/4320 | 4320/4320 |
| deterministic | 1148/1148 | 1148/1148 | 1080/1080 | 1080/1080 |
| Selected changed events (vs CURRENT) | NOT_RECORDED | NOT_RECORDED | 1039 | 1155 |

devは1,148case（named68を含む）、reservedは1,080case（namedなし）で分母が異なる。共通音変更率も併記する。devで24→18となった6件の解消はnamed Single↔Chord familyであり、そのfamilyのreserved確認はできていない。一方、wide / inversion / open等の大規模familyでも効果は残る。

Selected changed eventsのdev全体値はP11-13c summaryに保存されていないため **NOT_RECORDED**。今回これを補うためのdev再実行はしない。reservedではγ1がCURRENTから1,155event、λ2から120eventのfinger列を変えた（分母4,320）。Proxy movement / cyclic wrapは補助診断であり、これらの改善で採否を決めていない。

## F. Family Breakdown

変更数とCURRENT比退行case数を並べる。大規模6familyはdev/reservedとも各180caseで、named3familyのreservedは存在しない。

| Family (変更 / 退行case) | Dev λ2 | Dev γ1 | Reserved λ2 | Reserved γ1 |
| --- | --- | --- | --- | --- |
| white | 360 / 0 | 358 / 0 | 360 / 0 | 358 / 0 |
| black | 288 / 0 | 288 / 0 | 288 / 0 | 288 / 0 |
| cluster | 234 / 18 | 234 / 18 | 234 / 18 | 234 / 18 |
| wide | 492 / 0 | 468 / 0 | 488 / 0 | 460 / 0 |
| inversion | 380 / 0 | 334 / 0 | 392 / 0 | 352 / 0 |
| open | 324 / 0 | 312 / 0 | 324 / 0 | 312 / 0 |
| 1-to-2 | 4 / 2 | 0 / 0 | NOT_MEASURED | NOT_MEASURED |
| 2-to-1 | 4 / 2 | 0 / 0 | NOT_MEASURED | NOT_MEASURED |
| 3-to-1 | 4 / 2 | 0 / 0 | NOT_MEASURED | NOT_MEASURED |

新規重大family退行は0。事前contractでは、λ2で非退行だったcaseが新規退行する数が `max(3, ceil(5%×family cases))` 以上、または追加reassignmentが `max(2, ceil(5%×family common comparisons))` を超えることを重大と定義した。今回はより小さな新規退行も0で、どのfamilyもλ2より変更数が増えていない。

cluster退行はdev/reservedでいずれも **18/180case**、CURRENT変更216に対しλ2/γ1変更234という同様の傾向。元からの制約として残し、cluster専用rule・weightの追加は行わない。

## G. Representative Reserved Cases

事前rule: 6familyのうちfirst eventが2音以上の最小codepoint stable IDを各1件、さらにRH cluster/inversion/openから同条件で各1件。計9件。結果が良いcaseを選ぶ処理はない。以下はpublic synthetic。finger列はGoldではない。

| ID | Notes event順 | CURRENT | λ2 | λ2+γ1 |
| --- | --- | --- | --- | --- |
| left-2-white-10-ioi0.25 | [46,48] → [46,48] → [46,50] → [53,55] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [5,4] → [5,3] → [2,1] | [5,4] → [5,4] → [5,3] → [2,1] |
| left-2-black-10-ioi0.25 | [47,49] → [48,50] → [47,51] → [54,56] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [5,2] → [5,3] → [2,1] | [5,4] → [5,2] → [5,3] → [2,1] |
| left-2-cluster-10-ioi0.25 | [46,47] → [48,49] → [46,49] → [53,54] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [5,1] → [5,3] → [2,1] | [5,4] → [5,1] → [5,3] → [2,1] |
| left-2-wide-10-ioi0.25 | [46,53] → [58,65] → [46,55] → [53,60] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [2,1] → [5,4] → [2,1] | [5,4] → [2,1] → [5,4] → [2,1] |
| left-2-inversion-10-ioi0.25 | [46,49] → [51,54] → [46,51] → [53,56] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [3,1] → [5,4] → [2,1] | [5,4] → [3,1] → [5,4] → [2,1] |
| left-2-open-10-ioi0.25 | [46,53] → [51,58] → [46,55] → [53,60] | [5,1] → [5,1] → [5,1] → [5,1] | [5,4] → [3,1] → [5,4] → [2,1] | [5,4] → [3,1] → [5,4] → [2,1] |
| right-2-cluster-10-ioi0.25 | [70,71] → [72,73] → [70,73] → [77,78] | [1,5] → [1,5] → [1,5] → [1,5] | [1,2] → [1,5] → [1,3] → [4,5] | [1,2] → [1,5] → [1,3] → [4,5] |
| right-2-inversion-10-ioi0.25 | [70,73] → [75,78] → [70,75] → [77,80] | [1,5] → [1,5] → [1,5] → [1,5] | [1,2] → [3,5] → [1,2] → [4,5] | [1,2] → [3,5] → [1,2] → [4,5] |
| right-2-open-10-ioi0.25 | [70,77] → [75,82] → [70,79] → [77,84] | [1,5] → [1,5] → [1,5] → [1,5] | [1,2] → [3,5] → [1,2] → [4,5] | [1,2] → [3,5] → [1,2] → [4,5] |

全入力はBPM120、IOI0.25beat（0.125秒）、4event。完全なnotes/fingers/positionsはlocal JSONに保持する。この高速・2音寄りの代表選出には偏りがあるため、代表9件だけで一般化を主張しない。総集計は全1〜5音・全3timing variantを含む。

## H. Runtime

元と同じRH128-event stress / 最大10candidate、warmup後12回を1回の評価内で測定。arm順はCURRENT→λ2→γ1。共通pitchなしの元stressのみを最小限再測定し、追加profile探索は行っていない。

| Arm | median ms | p95 ms |
| --- | --- | --- |
| CURRENT | 97.90 | 106.03 |
| E1-T | 56.82 | 58.33 |
| CT=1 | 61.04 | 63.77 |

γ1はλ2より中央値 **+4.22ms / 約7.43%**、p95 **+5.44ms / 約9.33%**。事前重大基準「median≥2倍かつ+50ms、またはp95≥2倍かつ+100ms」には該当せずPASS。単一環境・12回・固定実行順の測定でありperformance SLAや安定した費用上限を保証しない。P11-13cでは元stressの中央値が約34%増だったため、その制約も引き続き残る。結果後のparameter変更・実装最適化・再測定はない。

## I. Final Verdict

**`HOLDOUT_CONFIRMED`**

事前固定条件でstructural / time / context / common-tone / family / runtimeがすべてPASS。全Anchor・determinism・入力/候補不変性・Rangeを維持し、γ1で再割当総数が減少、新規退行0。既存cluster18件は残る。

制約は、過去のreserved exposure、named3family未収録、transpose中心のsynthetic corpus、独立ergonomic Goldなし、有限time/context controls、単一環境性能測定。特にこの判定を「完全未使用holdoutでproduction promotionを決定した」と読み替えない。

**`READY_FOR_HUMAN_DECISION`**。CURRENT production defaultを維持。Span / Black Key / E3 / Reason UI / Hand Position UI、master merge / push / tag / releaseへ進まない。policyの再調整・reserved再挑戦なし。

保存済みJSONの読み取り整合検査もPASS（1,080case×3armのcommon/変更数・selected差分・同じcluster18件を確認）。元dev / P11-13b artifactのSHAは不変。文書・台帳保存はdocumentation-only。phase-doc / AI-handoff / security/privacy / `git diff --check`を実行してすべてPASS。code gateのtested HEADは `90ff4549`。

Git確認時のlocal masterは `ccf85c69`、local origin/masterより754commit ahead / 0 behind（fetchなし）。今回この差分を取り込まず、専用branch `feat/p11-13-fingering-hand-position` で完了。既存の無関係な未追跡audit/diagnosticsは変更していない。
