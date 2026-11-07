<!-- phase-id: 12.0 -->
# 251-00 — Source / Integration Audit

専用 branch `feat/p12-251-master`、開始 HEAD `bd8dff5ceff0115acf84ac80f807e3b22be07251`。既存P12修正の検証ソース `4445f00a` を保持した基準から分離した。local master は `8d107d32` のまま。merge / push は行わない。

今回の 2-5-1 Master v0.2 を正とし、同梱 v1.4 と現行P12を照合。旧L1–L5を前提にしない。Root AGENTS / handoff / Phase12手順を実読。対象配下nested AGENTSと `.agents/skills` は存在しない。Phase11のsource voicing / practice overrideは実コードに存在し、現行keyboard / live MIDI / sampled audio / repositoryを再利用できる。

## Source再生成

`node scripts/master251/generate.mjs <local-package-directory>` PASS。4 forms、各12キー、各36 onsets、各5音、合計48セル / 144 targets。tempo80、4/4、各音2拍、3和音後2拍休み（最終休み含む）を全件検証。参照JSONのkey / degree / symbol / onset / exact notes / LH・RHと144/144一致。A/CはLH1+RH4、B/DはLH2+RH3。マーカーはDAW C5=MIDI60表記でscientific音名より1オクターブ高い表記。実MIDI番号と参照JSONは一致しており、音域を移さず固定する。

Productionへの出力はForm / PitchClass / degree / symbol / exact notes / reference hands / tempoと拍数だけ。PitchClass順に整列しsource key order / marker / input path / checksumを除く。Raw MIDIおよびlocal-onlyはignored `p12-generated/master251/package/` のみ。ユーザーが自作教材の派生canonical dataの実装使用を許可している。

144 targetsレビュー出力: `p12-generated/master251/targets-review.json`。集計: `p12-generated/master251/source-audit.json`。同梱mockをChromiumで実表示しhomeを `p12-generated/master251/mock-home.png` に保存。既存の落ち着いたカード・鍵盤・状態表示のUI言語を継承する。

## 実装上の判断

|部品|実態と再利用|
|---|---|
|通常Chord Dojo|see / recall / memorize / tempo。通常ii–V–IとMasterは別SPECIAL、通常記録と今日の練習を保持|
|weak selector|通常weakKeysは通常用。Masterは48セルとseed付き同順位shuffleを別domainで実装|
|inputState / cleanRound|旧名称の存在を仮定せず、現行liveMidi reducerとheld / sustainedを使用|
|settle|ChordEntryは各コードのsnapshotとreleaseを前提。共通物理held-set settlerを追加し通常判定を変えない|
|Ready / Recall|問題間は全物理鍵release後にForm+Key表示と時計開始。進行内共通音hold許容。ii完成の必要NoteOnで時計終了、settle除外|
|keyboard|PracticeKeyboard再利用。隠す段階は固定範囲・neutral monitorで答えの音域/不足音も漏らさない|
|audio|useDojoMidi / 既存sampled piano / playbackController再利用。二重graph回避|
|persistence|strict Zodのoptional master251追加。既存atomic CAS / backups / recoveryを維持。親画面復帰時同期で新記録消失防止|
|resume|問題単位で保存。再開時は同セルをReadyからやり直し、旧押鍵/時計を引き継がない|

次は251-01→04を自動継続。source構造の矛盾・曖昧な抽出はなし。FAST / focused反復、FEATURE、最後にfresh FULLとWindows EXE。人間の実鍵盤・実音受入れは自分で承認せず、最終 `READY_FOR_HUMAN_PRODUCT_ACCEPTANCE` で報告する。
