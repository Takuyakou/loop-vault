<!-- phase-id: 11.0 -->

# P11-13c — Common Tone Soft Preference Ablation

## A. Common Tone実装方式

**診断結果: `COMMON_TONE_USEFUL`。候補γ=1。製品採用ではない。** E1-T / inverse / λ=2を固定し、CURRENTとλ2単体、Common Tone追加4点を同じdev入力で比較した。

方式はweak penalty。前後の**同じ手・同じMIDI pitch**でfingerが変わるたびに `γ` をtransition costへ加算する。同じfingerの保持は0。入力ごとの定数差を除けば保持bonusと等価で、pitch class一致や別の手には適用しない。新項目にはduration scalingを加えない。

Gridは **γ=0.125 / 0.25 / 0.5 / 1**。E1-Tのpreferred deviation単価2に対して1/16、1/8、1/4、1/2とした。CURRENT、λ2単体を含め計6 arm。実行前contract commitは `659b95d7`。共有pitch負荷試験の追加を含む診断実装は、全arm実行前の `da0b3266` にcommit済み。結果後のgrid追加・λ変更はない。

実装は `scripts/p11-13/commonTone.ts` の診断costModelと既存injection seamのみ。candidate除外、finger変更禁止、Saved Anchor上書きはない。候補生成、Hand Position Proxy、segment、empty-hand、cyclic DP、tie-break、notes、hand assignment、Rangeは固定。今回 `src/**` / E2E / UI登録の変更はない。

### Provenance / 再現

- tested code HEAD: `da0b32662d239602e32633416ea2ce31ffbc87c9`
- corpus: `p11-13-public-synthetic-v1` / version 1 / **dev-only**
- manifest SHA: `2a463c2990a54a3026f69ee02cb7dda2c0bcb4612223e5715ce01b34bb5fd0d2`
- scoring contract: `p11-13-properties-v1`; metric: `common-tone-followup-v1`
- boundary: authored-onsets; identity: authored-or-absent-fixed; snapshot: public-authored-notes; hand: fixed-input-hand
- dev 1,148進行 / 4,478 event。大規模fixtureのoffset0..5とnamed68を評価。reserved offsets6..11は未評価。private MIDI/Vault、外部運指datasetは未使用。
- CURRENTとλ2単体のdev集計が前回artifactと同一であることをassert。元のcomparison / frozen policy / lambda follow-up artifactはSHA不変。
- local-only outputs: `.local-evaluation/p11-13/common-tone/comparison.json` / `original-24-cases.json`。provenanceには元artifactと実装のSHAも記録。Gitへ追加しない。
- 再現command: `node node_modules/vite-node/vite-node.mjs scripts/p11-13/commonToneComparison.ts`

## B. Common Tone結果

全armでcommon-pitch comparisonsは **3,308**。cyclic wrapを含む。改善/退行caseはCURRENT比のreassignment数で判定し、実演奏の正誤Goldではない。「増/減」はcaseごとの差分をそれぞれ加算しており、差し引き前の値。

| Arm | 同finger保持 | Reassignment | 改善case | 退行case | 増えたchange | 減ったchange | Proxy movement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CURRENT | 1,144 | 2,164 | 0 | 0 | 0 | 0 | 13,120.5 |
| λ2 | 1,186 | 2,122 | 40 | 24 | 30 | 72 | 9,670.5 |
| +γ0.125 | 1,274 | 2,034 | 112 | 22 | 26 | 156 | 9,428.5 |
| +γ0.25 | 1,274 | 2,034 | 112 | 22 | 26 | 156 | 9,428.5 |
| +γ0.5 | 1,274 | 2,034 | 112 | 22 | 26 | 156 | 9,428.5 |
| **+γ1** | **1,282** | **2,026** | **112** | **18** | **18** | **156** | **9,436.5** |

γ1はλ2単体からreassignmentを96減らし、movementも234減らした（約2.42%）。CURRENT比のmovement減少は約28.08%。このmovementは内部proxyであり身体負担を測定した値ではない。

## C. 24 regression cases

| Arm | 元24の解消 | 残存 | 一部改善のみ | 悪化 | 元24以外の新規退行 |
| --- | ---: | ---: | ---: | ---: | ---: |
| λ2 | 0 | 24 | 0 | 0 | 0 |
| +γ0.125 | 2 | 22 | 0 | 0 | 0 |
| +γ0.25 | 2 | 22 | 0 | 0 | 0 |
| +γ0.5 | 2 | 22 | 0 | 0 | 0 |
| +γ1 | **6** | **18** | **0** | **0** | **0** |

解消はCURRENT以下のreassignmentになったcase。γ1で解消した6件は `1-to-2` / `2-to-1` / `3-to-1` 各2件。残る18件はすべてclusterで、γ1でもfinger変更を許す解が最小costとなる。上限γ1を超える探索やhard rule化は行わない。

| 構造 | Case数 | CURRENT変更数 | λ2変更数 | γ1変更数 | 元退行case | γ1解消 / 残存 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| white | 180 | 360 | 360 | 358 | 0 | 0 / 0 |
| black | 180 | 288 | 288 | 288 | 0 | 0 / 0 |
| cluster | 180 | 216 | 234 | 234 | 18 | 0 / 18 |
| wide | 180 | 504 | 492 | 468 | 0 | 0 / 0 |
| inversion | 180 | 432 | 380 | 334 | 0 | 0 / 0 |
| open | 180 | 324 | 324 | 312 | 0 | 0 / 0 |
| 1-to-2 | 2 | 0 | 4 | 0 | 2 | 2 / 0 |
| 2-to-1 | 2 | 0 | 4 | 0 | 2 | 2 / 0 |
| 3-to-1 | 2 | 0 | 4 | 0 | 2 | 2 / 0 |

他のnamed構造に新規退行はない。全family・全weightの集計はcomparison JSONに保存した。

### 元24件の機械可読詳細

`original-24-cases.json` に各caseのnotes、hand、candidate集合、全6armのselected fingers / positionProxy、各遷移のcommon pitchとbefore/after finger、E1 local/transition、Common Tone cost、total costを保存した。独立したJSON整合検査で **24case / 144arm経路 / 504edge PASS**。選択が既存candidateに含まれること、notes/hand一致、common pitchが実際の積集合であること、`CT=γ×変更数`、E1/CT分解を確認した。

CURRENTの`totalCost`は実際のCURRENT objective。CURRENT欄の`e1Cost`は同じ選択をE1-Tで計算したcounterfactualであり、CURRENT totalと足し合わせない。この違いは`costContract`に明示した。λ2/CT armのtotalはE1+CT。異なるobjectiveのtotal値の大小で採用を決めない。

## D. Property

| 確認 | 結果 |
| --- | --- |
| candidate-empty / solver / structural failure | 全6armで各0 |
| Saved Anchor sweep | 全6armで4,478/4,478保持 |
| deterministic rerun | 全6armで1,148/1,148 |
| notes / candidate集合不変 | 全6armで各1,148/1,148。固定hand入力を変更する処理なし |
| repeat fluctuation | 全6armで0 |
| context sensitivity | CURRENT 0/14、λ2と全CT arm 10/14 |
| 原single-note Time Sensitivity | λ2と全CT armでselection変化2回・方向維持 |
| Common Tone Time Sensitivity | 全CT armで固定10probeの方向維持、baselineで反応するprobeの固定化なし |
| Range invariance | 全4γの実adapterにfull snapshotと異なるsession Rangeを入力し同一選択、notes/hands不変 |
| segment / empty-hand | focusedで区間分離と空の手の経過時間保持を確認 |

同一音列の原time probeはIOI 0.03125〜16秒で、短い側のpreferred deviation6 / movement0から、長い側の0 / 6へ戻る。CT追加後も同一。共通音を含むprobeもIOI 0.125 / 0.25 / 0.5 / 1 / 2 / 4秒で固定した。

| Common Tone probe（LH/RHそれぞれ） | λ2 selection変化回数 | 全CT arm変化回数 | 方向 |
| --- | ---: | ---: | --- |
| common1 | 1 | 1 | 維持 |
| common2 | 0 | 0 | 両者とも元から時間非感応 |
| 2-note cluster | 2 | 2 | 維持 |
| 2-note open | 1 | 2 | 維持 |
| 2-note inversion | 2 | 3 | 維持 |

各probeでIOI増加時のpreferred distance非増加 / movement非減少を確認した。この有限fixture集合での確認であり、任意音列の保証ではない。Rangeはadapter/propertyと既存View回帰で確認しており、CTを製品UIに組み込んだE2Eではない。

fresh focused **17/17 PASS**（Common Tone新規5、foundation4、Hand Position5、既存View3）。diagnostic TypeScript / scoped ESLintもPASS。追加5件は、same pitch/handとbase cost、γ0同等性、変更を強制するSaved Anchor、segment/empty-hand、実adapter Range不変性を検証する。実行HEADは上記da0b3266。

## E. Representative Comparison

前回と同じ9音列とSaved Anchorを使用。以下のfinger番号は候補比較でありGoldではない。角括弧は1event内のfinger、矢印はevent順。各選択は入力notesを変えない。

| Case | CURRENT | λ2 | λ2 + γ1 |
| --- | --- | --- | --- |
| slow-bass | [5] → [5] → [5] → [5] | [5] → [5] → [5] → [5] | [5] → [5] → [5] → [5] |
| fast-bass | [5] → [5] → [5] → [5] | [5] → [4] → [3] → [2] | [5] → [4] → [3] → [2] |
| left-chromatic | [5] → [5] → [5] → [5] → [5] | [5] → [5] → [5] → [5] → [5] | [5] → [5] → [5] → [5] → [5] |
| left-octave | [5] → [5] | [5] → [1] | [5] → [1] |
| left-upper-single-to-3 | [5] → [5,3,1] | [3] → [5,4,1] | [3] → [5,4,1] |
| left-3-to-upper-single | [5,3,1] → [5] | [5,3,1] → [2] | [5,3,1] → [2] |
| left-repeat | [5,3,1] → [5,3,1] | [5,3,1] → [5,3,1] | [5,3,1] → [5,3,1] |
| inversion | [1,3,5] → [1,2,5] → [1,3,5] | [1,3,5] → [1,2,5] → [1,4,5] | [1,3,5] → [1,2,5] → [1,4,5] |
| loop-boundary | [5] → [5] → [5] | [5] → [4] → [5] | [5] → [4] → [5] |
| Saved Anchor（中央[4]固定） | [5] → [4] → [5] | [5] → [4] → [3] | [5] → [4] → [3] |

Saved前の選択: CURRENT `[5]→[5]→[5]`、λ2/γ1 `[5]→[4]→[3]`。Saved後は中央[4]を全armで保持し、隣接eventの変更は各0。上記9音列はγ1とλ2で同一選択だった。全4γの代表出力はJSONに残した。

## F. Runtime

128event RH fixture、warmup後12回、armを直列実行。単位ms。元fixtureは共通pitchなし。別の固定共有pitch fixtureは `[60,64,67+i%3]`、IOI0.5秒、common比較256で、新項目が作用する負荷も確認した。

| Arm | 元fixture median | p95 | 共有pitch median | p95 |
| --- | ---: | ---: | ---: | ---: |
| CURRENT | 101.63 | 112.70 | 102.88 | 109.82 |
| E1-T | 60.37 | 62.76 | 60.14 | 64.05 |
| CT=0.125 | 85.59 | 117.61 | 64.02 | 69.87 |
| CT=0.25 | 86.78 | 95.52 | 57.65 | 70.80 |
| CT=0.5 | 80.22 | 88.93 | 71.88 | 104.76 |
| CT=1 | 80.88 | 101.08 | 55.92 | 66.03 |

γ1は元fixtureでλ2単体より中央値 **約34%**、p95 **約61%**増加。共有pitch fixtureでは中央値が低くp95は少し増加した。単一環境・固定arm順・12回の測定なので差を安定した性能優位とは解釈しない。診断costModelのcandidate-pair評価費用と実行時の揺らぎを含み、今回の結果で最適化や再測定探索は行わなかった。hard runtime promotion budgetを設定した実験ではなく、性能昇格PASSを主張しない。

## G. 推奨

**`COMMON_TONE_USEFUL` / γ=1を次の人間判断用候補とする。** 事前ruleの全property条件を4点すべてが満たし、CURRENT比退行case数 → 元24外の新規退行 → total reassignment → movement → 小γの順で選ぶとγ1となった。結果を見てruleを変更していない。

選んだ理由は、λ2単体の24退行を18へ減らし、新規退行0、時間応答・Anchor・候補集合・notesを維持したため。γ0.125〜0.5は22件で、同じ結果だった。別案はCommon Toneを追加せずλ2を保持すること。性能費用と残存cluster18件を理由に、これも採用判断の比較対象として残る。

この結果は最適化対象に近い内部metricである。独立したergonomic Goldや実ユーザーの弾きやすさを検証していないため、Common Tone metric改善だけでproduction adoptionしない。代表10件はλ2から変更なしで、手のproxy効果を失う明白な退行は観測しなかったが、全音列での快適性を意味しない。

## H. 次の判断 / 最終状態

**`READY_FOR_HUMAN_DECISION`**。CURRENT defaultを維持。E1-T / Common Toneは製品採用しない。既存実験UIのλや既存EXEも今回変更していない。

診断のみのためfresh FULL / EXEは実施しない。P11-13bの過去FULL/EXE結果を今回HEADの結果として流用しない。Span / Black Key / finger crossing / hand size / Reason UI / E3への追加、default switch、master merge、push、tag、releaseは行わず、この比較で停止する。

最終軽量gate: phase-doc / AI-handoff validation、tracked security/privacy scan、`git diff --check` はすべて実行してPASS。台帳の `lastVerifiedCommit=da0b3266` はcode gateのtested HEADを指す。レポート保存commitはdocumentation-onlyである。
