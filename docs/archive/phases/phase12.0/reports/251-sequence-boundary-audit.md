<!-- phase-id: 12.0 -->
# Master Form A/C — 左手単音列の実solver境界監査

監査コード bab311493eca44b3fa5ff8399fc7be18a15754a0、元HEAD d7ea74e67f131746bea698b18246a5b6861b6394、branch feat/p12-theme-score。製品ソースは引き続き d0f66cdc7903b1e14ccaef74e62273e9193974fe。今回は監査・テスト・再生成検証toolingのみ。製品機能、cost/weight、固定notes/hands/fingers、保存形式、UIは変更していない。merge/push、新EXE、Phase12の段階進行なし。

## 結論と証明の範囲

現在の実targetを入力とする再現可能な検証jobで、A/C全24セルの左手を3イベントまとめてproduction共通adapter→real sequence solverへ渡すことを実呼び出し境界で捕捉した。左手は各セル1call×3events、右手も別の1call×3events。単音候補は各event {1,2,3,4,5}、実solverのlocal評価へ5候補すべて入る。全24セルの最終左手結果は[5]→[5]→[5]で、最終結果だけからイベント別solveと判断できない。

現Master UIは固定JSON参照。練習runtimeで3コードを毎回solverへ渡す実装ではなく、各eventを長さ1で再solveする実装でもない。実ViewのA/C全24セル×原音域/−12の48 SSR描画で固定readerの対象・戻り値・鍵盤ラベルを確認し、adapter/solver callは0。両手の全3コードの指mappingを原音域から−12の位置に保持する。

履歴上の限界: Git管理のscripts/master251/generate.mjsは固定音高/手の抽出までで、固定運指JSONの当時の生成jobはない。既存canonicalFingerings.test.tsは手組snapshotの再計算一致、旧統合補助scriptは生成済JSONのコピー。今回追加した正式な読み取り専用検証jobによる現在の再生成一致と実call証拠は示せるが、「過去にそのjobで作った」という履歴証明はできない。UI→solverの架空のruntime chainや過去生成経路を主張しない。

## 実入力と出力

MIDI60=C4の表記。DAW側のオクターブ名へ置き換えず、octave付きMIDI実数を扱う。

| セル | 左手の実入力順 | LH solver call × event数 | 各eventの実候補指 | 最終LH |
| --- | --- | --- | --- | --- |
| A:0 | D4(62) → G4(67) → C4(60) | 1 × 3 | 各 {1,2,3,4,5} | [[5], [5], [5]] |
| A:6 | Ab3(56) → Db4(61) → Gb3(54) | 1 × 3 | 各 {1,2,3,4,5} | [[5], [5], [5]] |
| C:0 | D4(62) → G3(55) → C4(60) | 1 × 3 | 各 {1,2,3,4,5} | [[5], [5], [5]] |
| C:6 | Ab3(56) → Db3(49) → Gb3(54) | 1 × 3 | 各 {1,2,3,4,5} | [[5], [5], [5]] |

A/C両Form×12keyを全件assert。全24行は監査rootのsummary-bab31149.csv / .json、実イベント・全候補・proxy位置・local評価index/cost・transition秒数・出力はboundary-bab31149.json。

adapter入力の拍はstart0/2/4・duration2、80BPM。solverでstart0/1.5/3秒・duration1.5秒、8拍=6秒loop、cyclic=true、unresolved全false、個人preferencesなし/anchors空。ii→VとV→Iの間隔は各1.5秒、I→iiのwrapは3秒（Iの2拍と末尾休み2拍を保持）。イベントID・入力順・chord.root/hand/custom familyも検査。

Cmajor Aのcandidate hand-position proxyは指5/4/3/2/1順で、D4:36/35/34/33/32、G4:39/38/37/36/35、C4:35/34/33/32/31。CはD4とC4が同じ、G3:32/31/30/29/28。これは鍵盤位置proxyで、実手の生体力学や弾きやすさの承認ではない。実solverに渡ったcandidate groupから取得した全候補に、実modelのlocal/transitionをそのままcall-throughする。stubが入力列/最終解を代作していない。

## [5]の局所基準と列最適化

src/domain/progressionFingering.ts:185の左手単音preferredは[5]。candidate生成:24は1〜5をすべて生成し、候補順[5],[4],[3],[2],[1]のraw localCostは0/10/20/30/40。採用E1-Tモデルはraw値をそのまま使わず、preferred distance×lambda2でlocal値0/2/4/6/8を使う。今回これら5値をreal cost評価で捕捉した。

rankCyclicFingerings:53は全候補の列を探索し、隣接transitionと末尾→先頭を評価。handPositionFingering.ts:40 / eRankerFingering.ts:5の採用policyはE1-T/inverse/lambda2/gamma1で不変。局所[5]priorと時間付きhand-position/common-tone transitionを併用して列の解を選ぶので、全部[5]という結果と「事前に[5]だけへ縮退」は異なる。

## 再生成jobから固定UIまでの根拠

1. scripts/master251/verifyFingerings.cli.ts:6 → verifyFingerings.ts:9 → regenerateFingerings.ts:14。generator入力は実TARGETSのnotes/referenceHands/時間のみで、canonical-fingering.jsonの指を入力にしない。既存JSONは生成後のoutput oracleだけ。
2. regenerateFingerings.ts:51 / :55 → production src/voicingPractice/rankPracticeFingerings.ts:8。3event snapshotを各手へ渡す。
3. 同adapter:20が全eventsを秒へ変換、:31がreal rankCyclicFingerings(events,options)を1回呼ぶ。
4. src/domain/progressionFingering.ts:57 / :74 / :88 / :100 / :107がcandidate生成・全choice・local・隣接transition・cyclic wrapを評価。
5. 全48セル/両手の再生成結果は既存固定JSONと完全一致。note hash 0a8244d5186f465e129dacfbeddc85b51979f6da84e1d11ea4fbcdf638ad78ed、profile fingerprint a1538e67764619d5b3f7d8244636ad328fc1b2f9c1c20950c73a6db4c0a81883も一致。jobは48×2=96calls、すべて3events。書込先はignored監査出力のみで製品JSONを更新しない。
6. src/domain/master251/canonicalFingerings.ts:5 / :10 / :21が固定JSONを検証・参照してoffsetだけを適用。実Master251View.tsx:96がreaderをuseMemoで参照。UIへ新generatorを接続していない。

捕捉テスト: src/domain/master251/sequenceBoundary.test.ts:43（real solver/costのcall-through）、:171（全24実cell）、:206（正式job・48cell一致）。実UI描画: fixedProfileUi.test.tsx:34 / :64 / :94。SSRの合成store初期snapshotとMIDI/metronome/preview providerのみfixture化し、実View/engine/range/固定reader/score/keyboardを実行。effects/実MIDI/実音は実行しない。

## Negative controls

同じ境界assertの検出力をtest内だけで確認。各mutationはafterEachでrestoreし、製品に残さない。

| test-only変異 | 捕捉 | 同じassertの結果 |
| --- | --- | --- |
| adapterをeventごとへ分割 | LH3call×1、RH3call×1 | whole-progression契約で検出 |
| solverのLH候補をL5 anchorsで事前固定 | 生成候補5、実local評価1 | 全5候補評価契約で検出 |
| adapterを迂回してpreferred local候補を採用 | solver call0 | whole-progression契約で検出 |

3変異はいずれもA:0の最終LHを[5],[5],[5]にできる。output差を人工的に期待せず、実call数/長さ/候補探索を検査。L5 controlはcandidate生成自体の削除ではなくanchorによる探索制限の変異で、正経路の空anchors条件と全候補評価条件を分けて検出する。

## 実行と結果

すべて監査commit bab311493eca44b3fa5ff8399fc7be18a15754a0でfresh実行。以前の製品FULLを今回監査HEADのFULLとして流用しない。

| 検証 | 実結果 |
| --- | --- |
| 新focused 2files | 29/29 PASS（境界28＋UI48描画を検査する1） |
| 関連回帰14files | 140/140 PASS（Master全domain、共通ranker/候補/position、Voicing Loop実UI、通常Dojo adapter、Vault retention含む） |
| 正式再生成CLI | 48cells / 96sequence calls / JSON・hash一致 PASS |
| fresh FAST | 81/81、App TS/source contracts/class lint/changed ESLint PASS |
| fresh FEATURE | unit90/90・browser52/52、App TS/lint PASS |
| 保全 | runtime差分0、canonical/共有solver/重み不変、他4worktree・master/cached origin・旧13EXE保持 PASS |
| FULL / 新EXE / 実MIDI・実音 | 未実施。限定監査・test/toolingのみ、共有製品コード/保存/再生変更なし、merge候補作成なし |

Focused:

    npm exec vitest -- run src/domain/master251/sequenceBoundary.test.ts src/domain/master251/fixedProfileUi.test.tsx

再生成:

    npm exec vite-node -- scripts/master251/verifyFingerings.cli.ts p12-generated/master-sequence-boundary/regenerated-bab31149.json

FAST/FEATURE:

    npm run test:fast -- --fresh scripts/master251/regenerateFingerings.ts scripts/master251/verifyFingerings.ts scripts/master251/verifyFingerings.cli.ts src/domain/master251/sequenceBoundary.test.ts src/domain/master251/fixedProfileUi.test.tsx
    npm run test:feature -- --fresh scripts/master251/regenerateFingerings.ts scripts/master251/verifyFingerings.ts scripts/master251/verifyFingerings.cli.ts src/domain/master251/sequenceBoundary.test.ts src/domain/master251/fixedProfileUi.test.tsx

関連回帰の全command・各exit/時間/sourcehash・logは監査rootのvalidation-bab31149.json。基準更新/retry/skipなし。

作成途中のUI fixtureは28PASS/1FAILが2回。初回は内部L5を日本語表示「左5」と混同、SSR初期storeも明示fixture化。2回目はA:1の前の独立Recall記録がなく、実schedulerが正しくA:0を選んだため失敗。合成の先行Recall記録を追加し、cell/range/指番号のassertを緩めず解消。初期CLIのmain判定はvite-nodeがscript名をargvから除くため未実行で、専用CLI入口へ分離して実job出力を検証。製品修正なし。失敗条件は監査rootのinitial-ui-fixture-failure.json / second-ui-fixture-failure.jsonへ保持。

## 成果物と次の確認

root <作業フォルダ>/Loop Vault-251-master/、監査root p12-generated/master-sequence-boundary/。

- review.html — 全24cellの短い表と実捕捉JSON、結果・再生成・保全・報告への入口。
- boundary-bab31149.json — 実solverイベント/候補/handpositions/コスト評価/transition/出力、3negative controls。
- summary-bab31149.csv / .json — 全24セル。
- regenerated-bab31149.json — 既存48cellと一致した再生成結果。
- validation-bab31149.json / focused・related・fast・feature・regeneration-job各log — 実commandと結果。
- preservation-bab31149.json — 製品無変更と他作業の保全。

監査の技術ブロッカーなし。人間が次に見るのはA:0/C:0の実数・候補1〜5・1call×3events・結果[5]の表と、固定UIの0solver callsという区別。過去生成jobの履歴証明は取得できず、今回の再生成一致で代用したと明記。元の製品候補の実MIDI/実音/教材・運指・内蔵進行/製品識別子移行・再起動/zoom承認は引き続きpending、今回の自動監査で承認しない。

2026-10-07追記: [最新両手教材](P12.0-01-master-form-templates.md)はffedfd2cでMaster固定指だけを変更。ここで証明した汎用sequence solverの555等・旧fingerprint・過去生成履歴の限界は不変。新template検証と旧genericBaseline検証は分ける。
