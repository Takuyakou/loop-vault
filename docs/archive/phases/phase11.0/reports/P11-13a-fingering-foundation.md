# P11-13a — 運指Ranker基盤

## A. Saved Anchor

修正前はRanker後に保存運指を上書きしていた。修正後はphysical signatureが一致する保存運指だけを候補1件へ固定し、前後との接続をDP内で評価する。不一致の保存値は適用しない。保存/解除によるAutoの変化はsession-only markerで示す。

左右手配分は既存assignment関数で決める。運指保存を理由に-100のsignature優遇を再適用して配分を変える経路はViewから外した。assignmentアルゴリズム・Voicing・MIDIは変更していない。

## B. Segment Solve

計算不能Voicingまたはinvalid/>5-note候補はbarrier。各連続segmentをopen DPで解き、端を接続しない。全進行を覆う場合だけcyclic。empty handはbarrierではなく、次の同手onsetまでの時間に空白を含む。snapshot.lengthBeatsをloop終端として使う。

## C. Tie-break

Total cost → preferred distance合計 → 候補index列。候補indexは既存生成順/local sortで固定され、finger配列も既存のlexical sortを保持する。

## D. Next Move

双方formalなら確定。片側のみなら一部推定、既知pitchのfingerを保持し未知endpointだけ点線/薄色/推定表示。双方無しなら推定。R5のreleaseをR2へ投影する経路を解消した。高度な指替えモデルは追加していない。

## E. Tests

Anchor接続/解除、signature mismatch、segment isolation、empty-hand elapsed time、tie determinism、Next Move三状態を検証。P11-12診断のView adapterも新しい公開seamへ接続した。旧後段overrideテストは同じ保存運指保持assertionをDP内Anchorで確認する形へ移行し、historical P11-12報告の数値は更新していない。

tested stage code HEAD `97679040`でfresh focused150/150 PASS、型検査・changed ESLint・diff check PASS。E1-T、E2、E3、default switchはこのcommitに含まない。
