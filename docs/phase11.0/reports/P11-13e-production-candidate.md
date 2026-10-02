<!-- phase-id: 11.0 -->

# P11-13e — E Ranker Production Candidate Integration

## 状態

`READY_FOR_HUMAN_PRODUCT_ACCEPTANCE`。ユーザーが P11-13d の HOLDOUT_CONFIRMED を受けて承認した候補統合を完了。tested / EXE HEAD は `4406d5b8813bc122f85ff13b071e477550cfb436`。master への merge は未実施。最終結果の記録は documentation-only commit とし、FULL をその文書 commit の実行結果とは主張しない。

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

以下はすべて tested HEAD `4406d5b8` の fresh 実測。過去の P11-13b FULL は今回の結果へ流用していない。

| Gate | 状態 |
| --- | --- |
| focused: frozen diagnostic parity / Saved / segment / empty-hand / cyclic / IOI / Range / Source / Next Move / Transport | PASS: 8 files、99/99 |
| relevant FEATURE/UI: Developer fallback、Source、Range、first chord、accessibility | PASS: FEATURE Vitest 120/120 + Playwright 11/11、追加 relevant UI 22/22 |
| fresh FULL: 全 static gates / Vitest / repository Playwright / diff | PASS: Vitest 3,792/3,792、Playwright 225/225、0 FAIL / 0 UNRUN |
| Windows raw EXE | PASS: release build、MZ / size / SHA-256 確認 |

追加テストは frozen objective の production parity、矛盾する Saved Anchor の固定、unsupported による segment、empty-hand available time、slow/fast Bass、全 source の notes/hands/Range/Next Move、通常 UI の default/fallback 運指差を確認する。既存 personal fingering / Next Move / transport の回帰を保持する。


### fresh FULL の内訳

実行: `node scripts/test-dx/run.mjs full --fresh`。PASS cache 未使用。

| Gate | 結果 / 秒 |
| --- | --- |
| repository ESLint | PASS / 9.2 |
| class lint / source contracts | PASS / 0.2 / 0.1 |
| App / E2E TypeScript | PASS / 9.6 / 1.3 |
| phase-doc / AI-handoff | PASS / 0.5 / 0.2 |
| privacy/security | PASS / 0.9 |
| production build / gallery exclusion | PASS / 7.6 / 0.2 |
| runner contracts | PASS 27/27 / 0.1 |
| Full Vitest | PASS 3,792/3,792、473 files / 64.3 |
| repository Playwright | PASS 225/225、2 workers、retry 0 / 239.4 |
| git diff --check | PASS |

FULL wall time **333.7 秒**、raw local logs **29,358 B**。log: `.local-evaluation/test-logs/2026-10-02T14-30-46-595Z-full.log`。アクセシビリティ、個人運指、Source switching、generated/saved/source/custom、first chord/Transport、Next Move の既存回帰を含む。baseline 更新・skip・fixme・retry の追加なし。

初回 FULL は Vitest の文書 validator 2 件のみ FAIL（3,790 PASS / 2 FAIL、Playwright 未実行）。原因は agent が TEMP/TMP を `.local-evaluation/build-temp` へ設定し、合成 fixture の物理パスが privacy rule に該当したため。TEMP/TMP を D drive 内の `src-tauri/target/test-temp` へ変更し、同じ code HEAD の該当 25/25 PASS を確認。製品・test expectation・validator を変えず、fresh FULL を最初から再実行して上記全 PASS を得た。初回 aborted attempt も記録し、「一度も失敗せず一回だけ実行した」とは主張しない。reserved / weight grid の再実行なし。

### EXE

- `npm run tauri build -- --no-bundle`、release compile PASS（Rust 59.55 秒）。Web build を E2E fixture flag なしで再生成。
- 原本: `src-tauri/target/release/loop-vault.exe`。
- Human Acceptance 用の固定 copy: `.local-evaluation/p11-13e/Loop-Vault-P11-13e-4406d5b8.exe`。
- 24,724,992 B、MZ header、SHA-256 `4b14b516d14a23d686782c027c1124316ca7ccee2d8676be70fe7431d2c8a28a`。
- source/build/temp/EXE は D drive 内。インストーラー未作成。実 Vault を開く自動起動は行っていないため、Windows desktop 上の実操作は Human Acceptance で確認する。

## Human Product Acceptance

EXE で Settings → Developer → 運指方式を切り替えて比較する。専門的に正しい finger の判定は要求しない。明らかに不自然な運指が多数ないか、slow Bass の過剰な指送り、fast Bass の文脈反応、単音↔和音、Saved 維持、UI と Next Move の一致を確認する。

## Git / 最終状態

local master `ccf85c69` は候補 HEAD の ancestor。tested HEAD で master 固有 commit 0、candidate 固有 19。FULL/EXE 後に tracked code/test/config 変更なし。最終追記は phase README / execution-state / report index / このレポートのみ。無関係な未追跡 audit/diagnostics は保持し stage しない。merge into master / push / tag / release / 次 stage は行わない。

## Remaining limitations

- 運指 Gold や人体適合の証明ではない。Hand Position は既存 proxy。
- reserved の残存 cluster regression 18 件は保持。cluster 専用規則や retuning は行わない。
- reserved は以前の lambda0.5 exposure がある。新規未使用 holdout とは主張しない。dev の named 1-to-2 / 2-to-1 / 3-to-1 は reserved に存在しない。
- reserved 再実行、private MIDI/Vault、外部 Fingering Dataset は使わない。
- rollback は session-only CURRENT。候補 default の最終採用は Human Acceptance 未了。master merge/push/tag/release は実施しない。
