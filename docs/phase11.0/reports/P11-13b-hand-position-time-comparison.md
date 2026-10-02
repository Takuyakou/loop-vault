# P11-13b — Hand Position + Time 比較・Human Decision資料

P11-13a / E1-T実装とbounded比較を完了し、**READY_FOR_HUMAN_DECISION** へ進める資料。E1-Tは採用・default switchしていない。集計上のProperty成立と、個別退行・人体上の正解未測定を区別する。E2/E3は実行しない。

## A. Hand Position Proxy

`w(p)`は白鍵整数、黒鍵中間値、octaveごと+7の相対座標。RH anchorは`w(p)-(finger-1)`、LHは`w(p)-(5-finger)`。候補内anchorのmedian（偶数なら中央2点の平均）を使う。人体の物理位置・到達距離・手サイズを表す量ではない。

候補生成は既存generateFingeringCandidatesのまま。左右手配分は入力として固定し、MIDI/chord/sourceVoicing/overrideを書き換えない。E1-Tのlocal scoreは`lambda × existing preferred distance`、transitionは`abs(position difference) × timePressure(IOI seconds)`。span/black-key/common-tone bonusは追加していない。

## B. DP / 時間 / 基盤

13aの同じsolverへcost modelを注入する。Saved physical signatureが一致したeventは候補1件へ固定。コスト不利でも保存fingerを変更しない。計算不能はsegment barrier、全進行を覆う場合だけcyclic。片手空白はbarrierではなく、次の同手onsetまでのIOIへ含む。loop終端はsnapshot.lengthBeats、wrapは最後onset→終端→最初onset。practice BPM overrideは秒換算へ使い、source snapshotを変更しない。

Tie: total cost → preferred distance合計 → 既存候補index列。E1-raw/zero-priorでもpreferredは同点規則としてのみ残る。両手は独立DPで、両手同時optimizationを追加していない。

候補上限K=10。各first candidateを固定してcyclic DPを解くためtransition workは概ねO(N K³)、state比較sortは追加log K、path配列の複製にはN依存がある。128-event stressは後掲。性能の絶対保証や人体上の閾値は新規定義していない。

## C. 比較契約 / provenance

arm実行前に`6a9c843a`で [bounded contract](../../../scripts/p11-13/EXPERIMENT-CONTRACT.md)をcommitした。

- corpus: `p11-13-public-synthetic-v1` / version 1、P11-12公開合成を再利用。
- dev: chromatic offsets 0..5の1,080件 + named68件 = 1,148件。
- reserved evaluation: offsets6..11の1,080件。policy freeze後に測定し、選択に使っていない。
- 全P11-12 large corpus: 2,160進行 / 8,640イベント、720 base cases / 696 distinct hand+pitch sequences。
- 大規模corpusは同一構造の転調を含む。独立楽曲/運指Goldの数として扱わない。
- policy IDs: CURRENT / E1-raw / E1-T-zero-prior / E1-T。CURRENTは13a基盤込み現行cost。
- matched notes、hand、candidate、onset/duration、chord metadata。時間ablation以外は同一入力。
- sourceManifest、codeCommit、corpus manifest SHA、scoring contract `p11-13-properties-v1`をlocal JSONへ保存。

### lambda / curve

gridは0.125 / 0.25 / 0.5 / 1 / 2 / 4。inverse、sqrt、shifted-inverseの18構成をdevのみで比較した。数値は有限の開発比較範囲であり、正解・快適速度ではない。

| Curve | 成立したgrid点 | 注記 |
|---|---|---|
|inverse|0.125, 0.25, 0.5, 1, 2, 4|集計Property / time方向 / context / Anchor|
|sqrt|0.25, 0.5, 1, 2|集計Property / time方向 / context / Anchor|
|shifted-inverse|0.125, 0.25, 0.5|集計Property / time方向 / context / Anchor|

採用**比較値**はinverse / lambda=0.5。最も広い成立runであるinverseの6点から中央2点の下側を選んだ。連続実数区間すべてを証明したという意味ではない。`timePressure(t)=1/max(t,0.001)`。0.001秒は数値保護のみで、高速/低速判定ではない。

この成立幅は**集計Propertyに対する有効grid幅**。個別Common Tone退行を無視してproduction採用可能と解釈しない。

### 同母集団比較（large2,160）

| Arm | Proxy movement total | shift median / p95 | wrap total | Common finger変更 / 6408 | repeat変化 | selected変更 /8640 |
|---|---:|---|---:|---:|---:|---:|
|CURRENT|25578|3 / 7|8820|4248|0|0|
|E1-raw|12888|1 / 4.5|4500|3948|0|4854|
|E1-T-zero-prior|12888|1 / 4.5|4500|3948|0|4854|
|E1-T|14946|1 / 4.5|5209.75|4064|0|3694|

Proxy movementはE自身が最小化する内部量なので、改善しただけで弾きやすさ改善の証拠にしない。candidate index分布・各pathはlocal JSONにある。

### dev / reserved別

|Arm|dev common変更|reserved common変更|time選択変化|context変化 /14|
|---|---:|---:|---:|---:|
|CURRENT|2164|2124|0|0|
|E1-raw|2006|1986|0|10|
|E1-T-zero-prior|2006|1986|0|10|
|E1-T|2068|2040|2|10|

Time probeは同じpitch列48/50/52/53のIOIだけを0.03125〜16秒へ変更した。E1-Tはpreferred distanceが6→1→0、movementが0→4→6の方向で変わる。CURRENTはpreferred0/movement6で不変、raw/zero-priorはpreferred6/movement0で不変。zero-priorが同じuniform IOIで不変なのは全pathへ同じ倍率が掛かるため。

Context probeは中間eventのpitchを固定し、前後だけを変えた14対照。選択変化を実測しており、特定finger列をGoldとした評価ではない。

### Switching-time Diagnostic

公開LH往復 `[48]→[50]→wrap`、同じ手に次の音が来るIOI。lambda=0.5、inverse。

- 約3.98107秒: [[5], [4]]、positions [28, 28]。
- 約4.04265秒: [[5], [5]]、positions [28, 29]。
- fixed position案のprior=0.5 / movement=0。preferred案のprior=0 / movement=2（wrap込み）。理論同点は4秒。
- 下側ではpreferred案のweighted movement≈0.50238 >0.5、上側では≈0.49472 <0.5。

この約4秒は診断結果であり、Goldや快適IOIではない。通常のBassで位置固定を強く優先する可能性を示す。central lambdaを結果を見て別値へ寄せていない。

## D. Property比較

|Property|結果|限界|
|---|---|---|
|Solver failure / structural failure|全arm 0 / 0|公開構成・既存構造制約内|
|candidate-empty増加|0|同じgenerator|
|input notes / hands / candidates|全arm 2160/2160不変|handは入力として固定、UIのSource切替も別検証|
|deterministic rerun|全arm2160/2160一致|同cost tie規則を含む|
|Saved Anchor|各arm8640/8640保持|全eventに既存候補を固定する独立sweep|
|repeat不要変化|全arm0|高度な反復音alternationは未実装|
|Single↔Chord structural failure|named corpus / focusedで0|快適なfinger Goldは未測定|
|IOI direction|単調Property PASS、E1-T選択変化あり|典型IOI内で常に変化するとは限らない|
|Range|実View / browserの同じeventで運指保持|Rangeをrankerに渡さない|
|segment / empty hand|focused PASS|unresolvedの両端をcycle接続しない|

**Common Toneは集計だけでPASSを言い切れない。** E1-Tは全体で4248→4064に減るが、dev42件 / reserved36件ではCURRENTより増える。2音cluster、inversion/open等の特定構造に集中する。これは独立Goldで「不要」と認定した指替えではないが、case単位の安全な非悪化は成立していない。採用保留の主な材料とする。

### LH単音Extreme Finger / IOI

|Arm|IOI seconds|L1|L2|L3|L4|L5|
|---|---:|---:|---:|---:|---:|---:|
|CURRENT|0.125|0|0|0|0|288|
|CURRENT|0.5|0|0|0|0|288|
|CURRENT|2|0|0|0|0|288|
|E1-raw|0.125|84|20|4|14|166|
|E1-raw|0.5|84|20|4|14|166|
|E1-raw|2|84|20|4|14|166|
|E1-T-zero-prior|0.125|84|20|4|14|166|
|E1-T-zero-prior|0.5|84|20|4|14|166|
|E1-T-zero-prior|2|84|20|4|14|166|
|E1-T|0.125|84|20|4|14|166|
|E1-T|0.5|84|20|4|14|166|
|E1-T|2|84|20|4|14|166|

このLH large単音subsetでは3つのIOI全てでE1-Tも同じ分布となった。公式time probeには感度があるが、large subsetのscale内では各pathのorderingを反転するほど弱いpriorが効かない。約4秒のswitching診断と整合する。式にIOIが渡されていないバグではないことはcost/選択probeとpractice BPM連動で確認した。parameter scaleとProxy偏重の**限界として保持**する。L1/L2自体をGold違反としない。

## E. Regression / UI / runtime

13a保存はDP内固定、現在の手配分に一致しないsaved signatureは適用しない。Viewで保存を理由に手配分を動かすsignature優遇を再実行しない。運指の保存/resetがVoicing notesや手配分を変えない。変わったAuto cardだけsession marker、永続化なし。

Next Moveは確定 / 一部推定 / 推定。既知fingerをestimated projectionで置き換えない。未知endpointのみ点線/薄色/推定。既存key/card/Next Moveの同じeffective運指を使う。

Settings → 開発者向け → 運指方式でCURRENT / E1-Tを切替。React external storeのメモリ内だけ保持、再起動/reloadはCURRENT。Rangeはmemo依存に含めない。practice BPM変更はIOI秒へ反映する。設定値や保存Voicing/Vault schemaを更新しない。

Browser focused12件PASS。1920×1080 /1440×900 /960×1032 /768×640はcurrent panel398/398px、Next Move68px。1440pxの比較画像を生成し目視確認した。10 finger boxとcertaintyラベルが収まる。既存responsive/layoutを全面変更していない。

初回browser実行はVite終了時のWindows libuv `UV_HANDLE_CLOSING` assertionで中断し、テスト開始前だった。同じfocused範囲の再実行はPASS。skip/retry設定/timeout/snapshot期待値を変更していない。

|Arm|128 event median ms|p95 ms|
|---|---:|---:|
|CURRENT|96.27|120.38|
|E1-raw|54.45|58.36|
|E1-T-zero-prior|58.09|61.53|
|E1-T|57.50|84.23|

同じprocess内warmup後12回の計算時間。最終tested HEAD `2d29ac97`で再測定した。browser/他process負荷で変わるため絶対値を一般化しない。別の旧commit94dae5b6との128-event spot比較は旧195.22ms /13a182.46ms（median、8回）。この環境で顕著な悪化は観測していない。hard realtime保証ではない。

## F. Remaining Problems

- 共通音のcase単位非悪化は未達。集計改善を安全な全面採用と扱わない。
- lambda=.5は今回の有限Property幅の中央であり、実利用の快適な指送り速度として検証済みではない。
- Hand Position Proxyはopen/wide/inversionの指間隔、手サイズ、黒鍵深さ、替え指を表現しない。
- 範囲を広げたnamed時間probeと、転調中心large corpusの一般化は別。独立fingering Gold無し。
- CURRENTはAnchorを固定しても強いpriorのため例の隣接Autoは変わらない。E1-Tは例で隣接1件変わる。
- source notes/hand assignmentを改善する研究ではない。10音超、unsupportedの元問題は維持する。

## G. E2 Recommendation

|Feature|判断|理由|
|---|---|---|
|Common Tone|NEEDED（比較するなら第一候補）|case単位の指替え増加が明確。weak soft preferenceの単独ablationを提案。まだ未実装。|
|Span|UNCLEAR|Proxyが物理reachを表さないが、独立快適性Goldが無く固定閾値を導入できない。|
|Black Key|UNCLEAR|black coordinateは位置のみ、1/5 penaltyを正当化する今回のevidenceが無い。|

E方式全体の採否、またはE2-Aだけ続行するかはHuman Decisionに委ねる。E1-rawの結果だけを理由に見送らない。lambda再調整/feature追加をここでは開始しない。

## H. Human Decision Material

代表9行 + Saved Anchor1行 =10件。指番号は合成出力の比較表示で、Goldではない。slow/fastはpitches、手配分、右手和音、候補集合が同一でIOIだけが違う。双方の右手は `[60,64,67]` を反復。

|Case / hand|IOI seconds|CURRENT finger列|E1-T finger列|Proxy移動 CURRENT→E1-T|
|---|---:|---|---|---:|
|slow-bass / left|2|5 → 5 → 5 → 5|5 → 5 → 5 → 4|6→4|
|fast-bass / left|0.125|5 → 5 → 5 → 5|5 → 4 → 3 → 2|6→0|
|left-chromatic / left|0.5|5 → 5 → 5 → 5 → 5|5 → 5 → 5 → 4 → 3|4→2|
|left-octave / left|0.5|5 → 5|5 → 1|14→6|
|left-upper-single-to-3 / left|0.5|5 → 5,3,1|3 → 5,4,1|6→0|
|left-3-to-upper-single / left|0.5|5,3,1 → 5|5,3,1 → 2|6→0|
|left-repeat / left|0.5|5,3,1 → 5,3,1|5,3,1 → 5,3,1|0→0|
|inversion / right|0.5|1,3,5 → 1,2,5 → 1,3,5|1,2,4 → 1,2,5 → 1,4,5|10→6|
|loop-boundary / left|0.5|5 → 5 → 5|5 → 1 → 2|8→0|
|Saved前後 / left|0.125|5 → 4 → 5|5 → 5 → 4|固定Anchor接続、隣接変化CURRENT0 / E1-T1|

人間に専門的正解finger作成は要求しない。見る点は「明らかな退行」「ゆっくりBassの不自然な指送り」「実曲で旧方式より弾きにくくならないか」。確認結果を自動Goldへしない。

Windows比較EXEは最終fresh FULL PASS後に生成する。E1-Tは試験切替のみ、default CURRENT。

## 実行・成果物

- code: `src/domain/progressionFingering.ts`、`handPositionFingering.ts`、`voicingPractice/rankPracticeFingerings.ts`、`nextMove.ts`、session mode/settings component、View接続。
- tests: foundation4、Hand Position5、実View3、Playwright1。既存P11-12 adapterを新seamへ接続し、歴史レポート値は未変更。
- diagnostics: `scripts/p11-13/comparison.ts` / contract / tsconfig。
- local JSON: `.local-evaluation/p11-13/comparison.json` / `frozen-policy.json`、代表表・screenshots。公開合成のみ。private Vault/MIDIは未使用。
- `node node_modules/vite-node/vite-node.mjs scripts/p11-13/comparison.ts` で同じ有限比較を再現する。出力はGit対象外。
- 最終Gate: 安定candidate code commitでfresh FULL1回（PASS cache無し）、EXE。結果はそのtested HEADへ固定し、後続文書HEADへ付け替えない。

## 最終判断

**P11-13a FOUNDATION / P11-13b COMPARISON = IMPLEMENTED。E1-T PRODUCTION ADOPTION = NOT DECIDED。COMMON-TONE CASEWISE NON-REGRESSION = NOT MET。**

集計Propertyの成立を全caseの安全性と混同しない。比較資料・切替EXE・最終Gateが揃った時点で **READY_FOR_HUMAN_DECISION** として停止する。E2/E3/default switch/master merge/push/tag/releaseは行わない。


## 最終fresh Gate / 検証環境

- tested code HEAD: `2d29ac97c7277beac8779d644f957a12faba3a00`。後続の完了記録commitは文書のみ。
- policy: `E1-T / inverse / lambda=0.5`。`--verify-frozen`でpolicy不変を確認し、同HEADで比較を再測定した。
- corpus manifest SHA: `a77bff81e044a70778dff87700747d81f676c03ee223573ff5ccf402fe31be9d`。code commitとsource file SHAはlocal比較JSONに保存。
- 実行: `LOOP_VAULT_PLAYWRIGHT_PORT=4183 node scripts/test-dx/run.mjs full --fresh`。通常のFULL runner、同じ全テスト・worker=2、PASS cache未使用、server reuseなし。
- FULL wall time: **274.4秒**、raw tool logs **28,622 B**、terminal summary **576 B**。

|Gate|最終HEADでのfresh結果|
|---|---|
|Repository ESLint / class / source-contract lint|PASS|
|App / E2E TypeScript|PASS|
|Phase docs / AI handoff|PASS|
|Privacy/security tracked scan|PASS|
|Production build / gallery excluded|PASS|
|Runner contracts|27/27 PASS|
|Full Vitest|3,736/3,736 PASS|
|Repository-wide Playwright（accessibilityを含む）|192/192 PASS / 0 FAIL / 0 UNRUN|
|git diff --check（master...HEAD / HEAD）|PASS|

FULLの初期3試行は別checkoutのpreview serverとport 4174が競合し、Playwright開始前に中断した。製品不具合/テスト失敗とは分類しないが、FULL PASSにも数えない。別作業のprocessを停止せず、独立chore `2d29ac97`でテストサーバーportを環境変数化した。Degree Echoの明示contextと320px Voicing LoopのCSP routeは同じ設定originへ接続する。既定port 4174、assertion、timeout、worker、retry、snapshot、CSP自体は維持。変更箇所focused2/2、Node contracts4/4、E2E型/対象lintを先に確認した。最終FULLは一時config adapterを使わず既存runnerから実行した。

初期試行のVitest/static結果を最終HEADのPASSとして流用していない。最終FULL logは `.local-evaluation/test-logs/2026-10-02T09-45-18-027Z-full.log`。private MIDI/Vault/外部運指datasetは未使用。

### Windows比較EXE / 停止状態

- EXE build HEAD: `2d29ac97`、`npm run tauri build -- --no-bundle` PASS。本番frontend再build、Tauri release compile PASS、installer無し。ソースbuild/temp/outputはD drive。
- EXE: `src-tauri/target/release/loop-vault.exe`、24716800 B、MZ header確認。SHA-256 `ba39d8c3912935106576365ada0a5c36cb1cfa46e55ca0db3ac3bc1083f46be2`。実Vaultを開く自動起動はしていない。
- Settings → 開発者向け → 運指方式からCURRENT / Hand Position + Time（試験）を切替。セッションのみ、起動/reloadでCURRENTへ戻る。保存音と手配分を比較中に変更しない。
- UI screenshotsは `.local-evaluation/p11-13/screenshots/`。公開合成fixtureによる4解像度検証のみ。
- **P11-13 = READY_FOR_HUMAN_DECISION**。13a基盤と13b比較を完了。E1-Tのcasewise common-tone非悪化は未達で、採用は保留。次にCommon Tone単独比較を検討するかを人間が決める。E2/E3は開始していない。
- masterは未変更。merge/push/tag/release無し。tracked working treeを文書commit後に確認し、作業開始前からあった無関係な未追跡3箇所は維持する。
