# P11-13 — E1-T lambda同条件比較

## 結論

**次の比較候補をlambda=2（第一候補）と4（保守的対照）へ絞る。** 0.5 /1は今回のshortlistから外す。採用・default変更ではない。CURRENTおよび既存EXEのE1-T lambda=0.5は維持する。

2は元の運指からの変更を減らしつつ、Proxy移動削減を残す。4はcase単位の共通音指替え退行が最少だが、中速の代表例でCURRENTと同じ選択へ戻りやすい。どちらも個別非悪化は未達で、人体上の正解は未測定。

## 比較条件 / provenance

- 人間からの追加依頼に基づくdev限定follow-up。実行前に `cd9d8998` で [追加契約](../../../scripts/p11-13/LAMBDA-FOLLOWUP-CONTRACT.md)をcommitした。
- corpus ID/version: `p11-13-public-synthetic-v1 / 1`、split=`dev-only`。同じ1,148進行 /4,478イベント、共通pitch比較3,308件。large転調offset0..5 + named68。
- dev manifest SHA: `2a463c2990a54a3026f69ee02cb7dda2c0bcb4612223e5715ce01b34bb5fd0d2`。tested diagnostic HEAD: `cd9d8998ed6353accc6761c47353f3ae18c8f9d1`。
- scoring: `p11-13-properties-v1`。境界=authored onset、snapshot=公開合成notes、hand=固定input、identity=authoredまたは無しを固定。
- 全armで同じ候補生成・cap・notes・左右手・onset/duration・wrap endpoint・tie規則。E1-Tのcurve=inverse、違いはlambdaのみ。CURRENTを同条件対照に含める。
- 保存Anchorは全armで同じsignature/fingersに固定。比較JSONへsource SHAとpolicy、旧artifact SHAを記録する。
- 既存dev sweepの全集計値と再測定値が一致することをassertした。旧comparison/frozen-policy JSONはbyte単位で不変。
- validation/offset6..11、private MIDI/Vault、sealed dataは今回実行・選択に未使用。

## Dev比較

Proxy移動は内部最適化量、preferred distanceも既存priorの内部量。弾きやすさの正解・人間の修正回数ではない。共通音指替えの改善/退行はCURRENTとの差。

|lambda|Proxy移動合計|CURRENT比削減|共通音指替え /3308|改善case|退行case|増えた指替え|減った指替え|preferred distance合計|変更event /4478|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|CURRENT|13120.5|0.0%|2164|0|0|0|0|0|0|
|0.5|7476|43.0%|2068|84|42|48|144|4334|1947|
|1|8715.5|33.6%|2072|90|39|45|137|3452|1569|
|2|9670.5|26.3%|2122|40|24|30|72|2418|1089|
|4|11149|15.0%|2120|44|15|15|59|1430|663|

退行は主にcluster。lambda0.5 /1 /2 /4のcluster退行caseは36 /33 /18 /15。1-to-2、2-to-1、3-to-1の各2件は0.5 /1 /2で残り、4では退行なし。4でもcluster15件が残るため安全な全面採用とは扱わない。

## 同じ音列の速い/ゆっくり比較

LHの `[48]→[50]→[52]→[53]`、手配分・候補・pitch・wrapを同一にしてIOIだけ変更。finger番号は合成出力でGoldではない。

|arm|IOI 0.125s|IOI 0.5s|IOI 1s|IOI 2s|
|---|---|---|---|---|
|CURRENT|5 → 5 → 5 → 5|5 → 5 → 5 → 5|5 → 5 → 5 → 5|5 → 5 → 5 → 5|
|lambda=0.5|5 → 4 → 3 → 2|5 → 4 → 3 → 2|5 → 4 → 3 → 2|5 → 5 → 5 → 4|
|lambda=1|5 → 4 → 3 → 2|5 → 4 → 3 → 2|5 → 5 → 5 → 4|5 → 5 → 5 → 5|
|lambda=2|5 → 4 → 3 → 2|5 → 5 → 5 → 4|5 → 5 → 5 → 5|5 → 5 → 5 → 5|
|lambda=4|5 → 4 → 3 → 2|5 → 5 → 5 → 5|5 → 5 → 5 → 5|5 → 5 → 5 → 5|

- 0.5 /1は0.5秒間隔でも位置固定の5→4→3→2を選ぶ。0.5は2秒でも最後の4が残る。
- 2は0.5秒で5→5→5→4、1秒以上で全5。0.125秒では指送りを維持する。
- 4は0.5秒から全5。速い0.125秒では同じ指送りを残す。
- 全lambdaでtime選択変化2、context選択変化10/14。時間や前後文脈へ反応する事実であり、選択したfingerが正しい証拠ではない。

### 2音往復のswitching診断

LH `[48]→[50]→wrap`の同じfixture。位置固定 `[5]→[4]`はprior=lambda、移動0。preferred `[5]→[5]`はprior0、移動2で、inverse weightingの同点IOIは `2/lambda` 秒。

|lambda|実測switch前後 IOI秒|理論同点秒|
|---|---|---:|
|0.5|3.98107 → 4.04265|4|
|1|1.99526 → 2.02613|2|
|2|0.98477 → 1.00000|1|
|4|0.49355 → 0.50119|0.5|

これはモデル内の切替点。快適な速度の閾値ではない。2音往復と上記4音進行は別fixtureなので、境界を混同しない。

## 同じ代表Voicingでの選択

各代表は以前の公開合成資料と同じnotes。短い指列の数字はpitch順のfinger。CURRENT、0.5、1、2、4を同じ順序で記載。

|case|IOI秒|CURRENT|0.5|1|2|4|
|---|---:|---|---|---|---|---|
|slow-bass|2|5 → 5 → 5 → 5|5 → 5 → 5 → 4|5 → 5 → 5 → 5|5 → 5 → 5 → 5|5 → 5 → 5 → 5|
|fast-bass|0.125|5 → 5 → 5 → 5|5 → 4 → 3 → 2|5 → 4 → 3 → 2|5 → 4 → 3 → 2|5 → 4 → 3 → 2|
|left-chromatic|0.5|5 → 5 → 5 → 5 → 5|5 → 5 → 5 → 4 → 3|5 → 5 → 5 → 5 → 4|5 → 5 → 5 → 5 → 5|5 → 5 → 5 → 5 → 5|
|left-octave|0.5|5 → 5|5 → 1|5 → 1|5 → 1|5 → 5|
|left-upper-single-to-3|0.5|5 → 5,3,1|3 → 5,4,1|3 → 5,4,1|3 → 5,4,1|5 → 5,3,1|
|left-3-to-upper-single|0.5|5,3,1 → 5|5,3,1 → 2|5,3,1 → 2|5,3,1 → 2|5,3,1 → 5|
|left-repeat|0.5|5,3,1 → 5,3,1|5,3,1 → 5,3,1|5,3,1 → 5,3,1|5,3,1 → 5,3,1|5,3,1 → 5,3,1|
|inversion|0.5|1,3,5 → 1,2,5 → 1,3,5|1,2,4 → 1,2,5 → 1,4,5|1,2,4 → 1,2,5 → 1,4,5|1,3,5 → 1,2,5 → 1,4,5|1,3,5 → 1,2,5 → 1,3,5|
|loop-boundary|0.5|5 → 5 → 5|5 → 1 → 2|5 → 1 → 2|5 → 4 → 5|5 → 5 → 5|

4は0.5秒のoctave、single↔3-note、inversion、wrap代表でCURRENTに戻る。2はそれらで変化を残す。4を第一候補にせず保守的対照にする理由。人体の快適性をこの表から断定しない。

## LH単音の分布

devの左手単音eventだけを数える。mixed-cardinality caseの複音eventを単音として数えない。各欄はL1/L2/L3/L4/L5順。

|arm|0.125秒（144 events）|0.5秒（189 events）|2秒（144 events）|
|---|---|---|---|
|CURRENT|0 / 0 / 0 / 0 / 144|0 / 0 / 0 / 0 / 189|0 / 0 / 0 / 0 / 144|
|lambda=0.5|42 / 10 / 2 / 7 / 83|52 / 13 / 8 / 13 / 103|42 / 10 / 2 / 7 / 83|
|lambda=1|42 / 10 / 2 / 7 / 83|52 / 13 / 7 / 13 / 104|0 / 0 / 0 / 0 / 144|
|lambda=2|42 / 10 / 2 / 7 / 83|52 / 11 / 5 / 12 / 109|0 / 0 / 0 / 0 / 144|
|lambda=4|42 / 10 / 2 / 7 / 83|0 / 0 / 0 / 0 / 189|0 / 0 / 0 / 0 / 144|

0.125秒の分布は全E1-Tで同じ。4は0.5秒・2秒で全L5へ戻る。極端fingerの件数を独立な良否Goldとは扱わない。

## Anchor / determinism / stability

- 全armで同じ4,478個の候補Anchorを固定し、4,478/4,478保持。solver/candidate/structural failureは0、repeat fluctuationは0。
- 入力notes/候補不変と同条件再実行一致は各arm1,148/1,148。
- Saved代表では全armで同じmiddle `[4]` を固定した。全armで保持、今回の代表の隣接Auto変化は0。
- 以前の `anchorControls` はarmの元選択と異なる候補を各armで選んでいたため、arm間でAnchorそのものが異なる場合がある。旧代表でCURRENTはmiddle `[4]`、E1-Tはmiddle `[5]` が保存入力だった。旧資料の「E1-Tで隣接1件変化」は同じ保存値を与えた比較ではない。今回は同じAnchorへ揃え、旧結果をlambda選択に使わない。

## Runtime / 検証

同一process、warmup後12回、128 events/maxK10。環境ノイズあり。runtimeを理由にlambdaを選ばない。

|arm|median ms|p95 ms|
|---|---:|---:|
|CURRENT|123.60|141.33|
|lambda=0.5|86.54|123.06|
|lambda=1|90.06|112.19|
|lambda=2|85.84|94.16|
|lambda=4|77.39|95.08|

- tested diagnostic HEAD `cd9d8998`でdev比較・旧dev集計一致assert・旧freeze JSON不変assert PASS。
- diagnostic TypeScript / changed ESLint PASS。domain focused9/9 PASS。診断関数を共有moduleへ抽出し、元の関数bodyが不変であることも確認した。
- production `src/**`、UI、candidate generator、ranker、既存test期待値は変更無し。今回repository-wide FULL/EXEは再実行していない。
- 旧FULL 3,736 Vitest /192 Playwright PASSとEXEはtested HEAD `2d29ac97`の結果として保持し、このfollow-up HEADへ付け替えない。
- スクリプト: `node node_modules/vite-node/vite-node.mjs scripts/p11-13/lambdaComparison.ts`。local JSON: `.local-evaluation/p11-13/lambda-followup/comparison.json`。provenanceと詳細はここにある。

## 絞り込みと限界

**第一候補2 / 保守的対照4。** 0.5 /1を除くと、devの共通音指替え退行caseを42 /39から24 /15へ減らし、速いBassの指送りを維持できる。2はCURRENT比Proxy移動26.3%削減、4は15.0%削減。2の選択はbalance上の診断recommendationであり、重み2が4より人間に快適と実証したものではない。

共通音保護をlambdaだけで完全には回復できない。両候補ともcasewise非悪化未達。人体・手サイズ・黒鍵深さ・替え指のGoldなし。devは合成転調を含み、実曲数・独立検証数として水増ししない。validationは今回未評価。

ユーザーの追加比較依頼を完了し、Human Decision待ちへ戻る。既存freezeは保持、production default変更・E2/E3・master統合は未実施。既存EXEはlambda0.5のままで、今回の2/4 recommendationを組み込んだEXEではない。
