<!-- phase-id: 12.0 -->
# 251-04 — P1修正版の最終検証・人間受入待ち

**READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**。独立レビューで不合格になった前候補d4ddf93dのMaster速度・テンポ受入れを取り下げ、P1を修正した。技術ゲート・新EXEは以下のソースで再実行済み。P1の独立再レビュー、native GUI・実MIDI・実音の人間受入れは未実施。merge/push/PR公開/release/deployなし。

製品ソース: `bb186dfbefb588fa287f254c55be9c9f6ec1eae6`、branch `feat/p12-251-master`。最終報告commitは文書だけで、製品/テスト/script差分0を確認。local masterは8d107d32、devの5項目・master側3項目・旧worktree/EXEを保持。通常P12修正4445f00a・Master v0.2・通常/Masterのproduction運指を継承する。

## P1の修正と再現

製品差分は `src/domain/practice/heldChordSettler.ts` 1ファイル。候補が全離鍵・不足・余音で無効になったら旧完成時刻を破棄し、余音なしexact集合を成立させた必要NoteOnだけに新時刻を設定する。settle60msをRecallへ加えない。

|入力|前候補|修正版|
|---|---|---|
|ii100ms→120ms全離鍵→10000ms再押鍵|Recall0.1s / Tempo起点100ms|Recall10s / 起点10000ms、各2拍を新起点で進める|
|必要音+余音100ms→余音NoteOff500ms|完成On100msを残す|完成NoteOn未定義。旧100msを返さない|
|settle中extra/不足→必要NoteOn200ms|元100msを残す|無効候補を捨て、新しい200msを記録|
|iiをNoteOffだけでexactへ修正|古いNoteOnへさかのぼる|新しい完成NoteOnがないため最初の和音の再押鍵を要求し、速度/Tempo資格へ使わない|
|10sのRecallを持つ80BPM成功|古い高速値で資格の恐れ|MASTER資格なし|

[修正報告](251-04-p1-timing-correction.md)、[契約補足](../contracts/251-master-amendment.md)。修正前は既存18PASS/追加6FAIL、修正後Master24+通常Dojo15の39PASS。2つのbrowser回帰は実ブラウザで全離鍵→再押鍵後の保存Recallと最初の2拍を検証する。

全参照を実検索し、共有settlerのproduction consumerは現在Masterのみ。通常DojoのChordEntry、view/運指/keyboard/store/解析/transport/package/lockは追加変更0。通常Dojo回帰も集約検証に含める。V/Iの共通音physical hold・現在集合判定を維持する。

## 受入条件

|v0.2の条件番号|結果と根拠|
|---|---|
|1・18 SPECIAL / 48マス|通常ii–V–Iと別入口/画面、48状態マス・確認札、UI/E2E|
|2・3 教材 / privacy|4 MIDIから48セル144 targets再生成、参照JSON144/144完全一致。MIDI番号・octave・LH/RH固定、raw/hashがGitへ入らないことを再検証|
|4 PC正規化|0–11 identity、異名同音、strict optional schema、unit|
|5・14 出題 / Mixed|優先度+同順位seed shuffle、source順不使用・C固定なし。異なるForm/Key4周、実reloadと通常練習後の記録保持をbrowser検証|
|6 隠すRecall|Form+Key、名前/音/answer/fingers非表示、固定C2–C7 neutral monitor。4サイズの隠す状態で表示漏れ0|
|7–9 exact / hold / settle|144対象の正解・octave shift・余分を照合。共通physical hold許容、不要hold FAIL、CC64-only除外。60ms current-set settleとstagger・途中extra・released snapshot検証|
|10・11 Ready / 時間|全physical鍵release後の問題表示で開始、ii完成の最後の必要NoteOnで終了しsettle除外。再開は同セルReady|
|12 自動進行|feedback後Enter不要で次/同セルretry。Hint回は同セルの独立retry|
|13 テンポ|60開始、40/50 fallback、70/80へ。80BPM・各2拍・末尾2拍rest。ii attack基準8拍clock、global transport不変|
|15–17 MASTER / review|Hint/Learn不適格、独立80+currentRecall内成功を別日で2回必要。1失敗reviewDue、別日再確認。unit境界ケース|
|19 自動検証|domain24、clock1、運指3、UI追加・既存回帰、source/canonicalとprivacy scan|
|20 最終検証 / EXE|下記候補のfresh FULL・native保存・Windows EXEがPASS|

運指はVoicing Loopの `assignPracticeHandsAcrossProgression` → `rankPracticeHandFingerings`、共有modeの現default E1-Tを再利用。新algorithm/rankerなし。既存PianoKey数字描画を共有化しdefault位置・色を維持。Learn/See/Hint/回答で表示、独立Recall/Tempo/Mixedで非表示、Ready/pause/次問で残留0。実際の使用指/手はMIDIで判定しない。Masterは最初のHintから数字と位置が出る追加要件を [変更契約](../contracts/251-master-amendment.md) に明記した。

旧storeを新readerが読める。optional master251だけ追加、Vault v2とnative保存コードは不変。native JSON envelope/CAS/atomic backup/restoreを保持し、web reloadと通常練習後のMaster保持を検証。新欄を旧readerで読む互換は保証範囲外。


## 新ソースの検証

|ゲート|結果|ローカル証跡|
|---|---|---|
|FEATURE|PASS unit70 / browser38、120.9s|2026-10-05T05-29-55-573Z-feature.log|
|UI|PASS 35/35、66.7s|2026-10-05T05-31-56-783Z-ui.log|
|fresh FULL|PASS unit3834/3834（481files、66.5s） / browser272/272（296.6s） / Runner27/27、398.1s、cache不使用、skip0|2026-10-05T05-33-03-844Z-full.log|
|静的・製品|PASS ESLint/classes/source/E2E TS/app TS/docs/handoff/privacy/production/gallery除外/git diff|同FULL|
|native保存・復旧|PASS 12/12、42 filtered、0.27s|native-storage-bb186dfb.log|
|source/canonical|PASS 144/144再生成一致、raw/hashのGit混入0|source-audit.json / privacy-local-scan.json|
|P12撮影|PASS 4サイズ×11状態44枚、外側横overflow0|p89-generated/P12.0-01/manifest.json|
|Master/運指撮影|PASS Master32+通常16枚、外側横overflow0、Recall/Tempo/Ready漏れ0|screens/manifest.json / normal-fingers/manifest.json|
|レビュー実表示|PASS 48画像欠落0・pageerror0・144教材SVG。新画像も実閲覧|review-display-verification.json|
|新Windows EXE|PASS production / release compile52.60s / x64 PE / source metadata / fixtureとgallery除外|exe-build-bb186dfb.log / exe-verification-bb186dfb.json|

DXログは `.local-evaluation/test-logs/`、他の証跡は `p12-generated/master251/`。ユーザーの実Vault/録音を読み書きしていない。旧データ→新reader、web reload、通常練習後のMaster保持・Vault保持とP10往復はFULL/nativeに含める。

## 失敗履歴

P1のred再現6件は旧候補の欠陥を確認するためで、修正版は全件PASS。FASTは修正中の同一製品コードでunit61/browser12 PASS（89.3s、05-24-07-676Z）。最初のFEATUREはunit70/browser38が通ったが、実行中に私がhandoffを更新し入力固定guardでFAIL。PASSゲートとして扱わず、文書を含む候補をbb186dfbへ固定して再FEATURE/UI/fresh FULLを実行し上表のPASSを得た。

新sourceのfresh FULLは初回PASS。前候補ではP10.2開始cueの間欠的失敗があり、当時の失敗証跡を `full-failure-20261005-044012/` に保持。原因未断定でこの制限を消さない。前候補の詳細はcommit f9552677の同報告。今回の画像baseline更新・期待値緩和・skip/retry追加は0。

## 成果物

EXE: `<作業フォルダ>/Loop Vault-251-master/p12-generated/master251/review-candidate-bb186dfb.exe`、24,864,768 bytes、Windows x64。SHA256 `96769517b5b3f407ab31a9fd27a3c8e6494071e5c8c4685dfb92d0906705b8b5`。

- 製品画像レビュー: `p12-generated/master251/review.html`（48枚）。
- 固定144教材: `targets-review.html` / `targets-review.json`。
- 通常P12の44枚: `p89-generated/P12.0-01/`。
- P1 before/after: `p1-reproduction.json`、現candidate: `final-candidate.json`。
- 旧EXE d4ddf93dは別ファイルのまま保持。旧画像/HTMLは `p12-generated/master251/review-d4ddf93d/`、P12旧44枚は `p89-generated/P12.0-01-d4ddf93d/` に保持。

## 人間が次に確認すること

1. P1独立再レビュー: bb186dfbで100→120全離鍵→10000再押鍵のRecall/Tempoと、余音をNoteOffのみで直すiiの扱いを再確認する。修正済みと自分で機能受入承認したとは扱わない。
2. 新EXEの実MIDI接続・ピアノ実音・通常See/Recall運指切替、Masterの共通音hold・Ready・Hint/Wrong・80BPMの各2拍/rest・pause/return/再起動を実機確認する。
3. 旧候補でこの入力を行ったMaster記録は自動的に正しいと再承認しない。誤記録を識別できないため遡及消去/補正はしていない。保存データを保持したまま受入時に再確認する。
4. 通常P12の実音レシピ・41理論point・30和音測定と待ち時間は未受入れ。settle60ms、partial1200ms、Form推奨3learning+、Recall5→3→分布・1.5–5s、Tempo40/50/60/70/80、feedback450/1600msはDEFAULT_POLICYの調整可能値で実演奏最適値の人間承認ではない。
5. weak-key開始は型/コード種類に適用済み。登録voicingは元の音域、保存進行は元のキー。登録voicingの12key展開はv1.4 §15の後続機能で未実装と分ける。

全UI到達性監査・native GUI実起動・物理MIDI・実音聴取・音楽的承認は未実施。撮影92枚や個別browser操作成功から一般化しない。狭い幅の鍵盤内部横スクロールは保持する。技術ゲートのblockerは解消し、独立再レビュー/人間Product Acceptanceで停止する。
