# Loop Vault Phase 7 FINAL — START HERE

## Codexへの開始命令

このZIPをLoop Vault repositoryの作業用環境へ展開し、最初にこのファイルと `01-PHASE7-MASTER-INSTRUCTIONS.md` を読むこと。

その後、ユーザーへ途中承認を求めず、P7-00 → P7-11 を順に自律実行する。

通常の実験失敗・テスト失敗・実装上の小さな障害では停止しない。原因を特定し、Phase 7で許可された研究用コード・fixture・evaluation script・documentationの範囲内で修正し、再テストして進める。

ただし以下はHard Stop:

1. private MIDI / credential / personal path / ignored-local artifactをGit追跡対象に含める必要が生じる
2. production Core / Vault schema / fileVersion / migration / Live MIDI production path / MIDI Export contractを変更しなければ研究を続行できない
3. sealed holdoutの答え・詳細失敗位置を見た後に同じholdoutへ再調整する必要が生じる
4. repository破損・不可逆Git操作・権限拡張が必要
5. 研究予算・Stage上限を超える追加探索が必要

Hard Stop以外は確認質問で止まらない。

## Phase 7の目的

Phase 7はCore v2の本番実装フェーズではない。

目的は、既存Coreの延長を正当化することではなく、Loop Vaultが必要とするMIDI解析をゼロベースで比較し、Phase 8で実装するCore v2のReference Architecture・評価契約・実装順を決めることである。

最重要の考え方:

> 「コード名が当たったか」だけを測らない。
> Role / Boundary / Voicing / Harmonic Identity / Temporal Decision / Persistence & Playback を分離して、どこで情報を失ったか測れるようにする。

## Phase 7の禁止事項

- Core v2 production integration
- default Analyzer mode変更
- Vault schema変更
- fileVersion変更
- migration追加
- saved data書換え
- Live MIDI production behavior変更
- Chord Dojo / Voicing Loop production behavior変更
- MIDI Exporter契約変更
- UI本実装
- private MIDIのcommit
- holdoutを見た後のretune
- 特定ファイル名・特定小節・特定rootに対するhard-code

## 実行完了条件

P7-11で以下を出力してSTOPする。

- 採用するCore v2 Reference Architecture
- 不採用案と理由
- component interaction matrix
- Tier 1 / Tier 2評価結果
- Copy Baseline比較
- Role / Melody contamination結果
- Boundary / passing-chord結果
- Candidate recall / ranking / decoder結果
- Correction Cost結果
- Live MIDI方針
- Vault vocabulary方針
- BACHI external baseline結果（実行可能な場合）
- sealed holdout結果
- performance / regression結果
- Phase 8 implementation plan
- 未解決点とrisk register
