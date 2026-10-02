<!-- phase-id: 11.0 -->

# P11-13e — E Ranker Production Candidate Integration

## 状態

検証中。ユーザーが P11-13d の HOLDOUT_CONFIRMED を受けて、通常のおすすめ運指への候補統合を承認した。master への merge は未承認・未実施。この段階の停止地点は `READY_FOR_HUMAN_PRODUCT_ACCEPTANCE`。

## 最新 local master との統合

- 作業 branch: `feat/p11-13-fingering-hand-position`。
- 直前 candidate: `23b30b41`、local master: `ccf85c69`。candidate/master の固有 commit はそれぞれ 17/34。
- master を candidate に取り込んだ merge: `c54b360d`。競合なし。Phase 10.1〜10.3 の correction workspace 等の 72 ファイルの変更を保持。master 自体は変更していない。
- local master は記録済み origin/master より 754 commits 先、遅れ 0。fetch/push は行わない。

## 選んだこと / 理由 / 別案

選んだこと: 通常の Voicing Loop のみ frozen E1-T を default にし、Developer 設定に session-only CURRENT を残す。理由: dev 選択後の reserved 確認済み policy を、人間の製品確認へ進めるため。別案: CURRENT を維持して研究を追加する案は、この承認済み stage では採用しない。

## Production 接続と frozen policy

- `src/domain/eRankerFingering.ts`: E1-T / P11-13b Hand Position Proxy / inverse / lambda=2 / gamma=1。既存 Hand Position cost に同じ手・同じ MIDI pitch の finger reassignment 数を加える weak preference。
- `ProgressionVoicingPracticeView.tsx`: 既存 costModel injection seam へ接続。mode 変更時のみ model を作り直す。CURRENT は既存 cost を使用。
- `fingeringRankerMode.ts`: 初期値 E1-T。`FingeringRankerComparisonSettings.tsx`: Settings の Developer 内で「新方式（候補）」/「CURRENT（従来方式）」を切り替える。reload で候補 default へ戻る。Vault/UI 永続化なし、通常練習 header に方式選択を追加しない。
- frozen diagnostic `scripts/p11-13/commonTone.ts` は変更せず、production cost/selection の一致テストの参照にする。以前の lambda=0.5 experimental 定数は研究履歴として残るが通常 VL 経路では使わない。
- candidate generator/cap、notes、identity、hand assignment、Saved format、Source Voicing、Range、segment/empty-hand/cyclic solve と tie-break は変更しない。Saved を固定 node とする既存 adapter と session marker を保持する。
- candidate exclusion・same finger 強制・Saved 上書きなし。Span/Black-key/手サイズ/crossing/cluster 専用規則と E3 UI は追加しない。

## 検証計画と結果

以下の結果は実行後に tested HEAD とともに記録する。過去 HEAD の FULL を今回の PASS として流用しない。

| Gate | 状態 |
| --- | --- |
| focused: frozen diagnostic parity / Saved / segment / empty-hand / cyclic / IOI / Range / Source / Next Move / Transport | 未完了 |
| relevant FEATURE/UI: Developer fallback、Source、Range、first chord、accessibility | 未完了 |
| fresh FULL: 全 static gates / Vitest / repository Playwright / diff | 未実行 |
| Windows raw EXE | 未生成 |

追加テストは frozen objective の production parity、矛盾する Saved Anchor の固定、unsupported による segment、empty-hand available time、slow/fast Bass、全 source の notes/hands/Range/Next Move、通常 UI の default/fallback 運指差を確認する。既存 personal fingering / Next Move / transport の回帰を保持する。

## Human Product Acceptance

EXE で Settings → Developer → 運指方式を切り替えて比較する。専門的に正しい finger の判定は要求しない。明らかに不自然な運指が多数ないか、slow Bass の過剰な指送り、fast Bass の文脈反応、単音↔和音、Saved 維持、UI と Next Move の一致を確認する。

## Remaining limitations

- 運指 Gold や人体適合の証明ではない。Hand Position は既存 proxy。
- reserved の残存 cluster regression 18 件は保持。cluster 専用規則や retuning は行わない。
- reserved は以前の lambda0.5 exposure がある。新規未使用 holdout とは主張しない。dev の named 1-to-2 / 2-to-1 / 3-to-1 は reserved に存在しない。
- reserved 再実行、private MIDI/Vault、外部 Fingering Dataset は使わない。
- rollback は session-only CURRENT。候補 default の最終採用は Human Acceptance 未了。master merge/push/tag/release は実施しない。
