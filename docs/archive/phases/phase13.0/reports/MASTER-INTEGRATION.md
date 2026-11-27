# Phase 13 — local master integration

## 結果
人間の明示的なマージ指示に従い、Phase 13 Bass Practiceをlocal masterへ統合した。

- 統合前master: `4175c29503963557e41d7841735f06138c342051`
- FULL検証候補: `b0056ab471dfa76327cb6c6fefa891d852b80f9f`
- merge commit: `12d2961a7406574a166524be12c23358898ccab2`
- candidate / merge tree: `015275b7af7cf2a9007f988f1d38c30c784dfce5`（完全一致）
- 最新masterのP12 / P12.1を保持。以前の候補報告の「P12未統合」は当時の履歴である。
- push / tag / release / EXE再生成は実施していない。

## 競合解消
`550d32c1` で最新masterを候補へ取り込んだ。4ファイルの競合を双方の機能を保持して解消した。

| ファイル | 保持した契約 |
| --- | --- |
| src/App.tsx | P12 ChordDojoViewと専用幅・高さ、Phase 13 Bassのcompact領域 |
| PracticeWorkspace.tsx | Dojo専用frame、Bassのdesktop / narrowスクロール設定 |
| practiceActivity.ts | Dojoの記録・matched集計とMIDI Bassのattemptsを別入力で集計 |
| useHomeSummary.ts | 両storeの購読と初期化を保持 |

ホームの両記録を同時に集計する回帰を追加。Master / Chord Dojo製品実装、既存Analyzer、Voicing、Vault、依存関係には統合前masterからの追加変更がない。

## 失敗切り分けと最小テスト修正

1. `550d32c1` のFULL: Vitest 4,163 PASS、Playwright 438 PASS / 1 FAIL。公開合成マイクの初音判定が3/4となった。fixtureはMediaRecorder.start時にAudioContext.resumeを完了待ちせず発音していた。`eb9aec87` は入力clockをresumeしてからstreamを返す同期修正のみ。変更前focusedは6/6 PASS、変更後は12/12 PASS。波形・期待値・製品の解析閾値は変更していない。反復結果だけで実機入力の精度や製品原因の不存在を断定しない。
2. `eb9aec87` のFULL: Vitest 4,163 PASS、Playwright 438 PASS / 1 FAIL。Master Homeの高さ完全一致が239px対238pxで失敗。動的日本語のswap-fontを固定300msで待って測定していた。`b0056ab4` は表示文字に必要なfontを明示loadし、font完了とlayout frameを待つ変更のみ。3解像度×3回=9/9 PASS。高さの完全一致、操作領域、overflow等の期待値は維持。製品CSS変更なし。
3. 実行環境: 既存P12 helperがOS既定TEMPへ一時ソースbundleを作ることを検出した。初期検証ではC側TEMPを使用しており、helperの通常終了時にbundleを削除する実装だった。以後はD内TEMP/TMPへ固定した。進行中FULLを停止して設定を修正したため、その試行は未完了として扱う。
4. D内TEMPを保護対象の`.local-evaluation`配下にすると文書validatorのgood fixtureが保護チェックで2件FAILした。validatorを変更せず、既存ignored生成領域のTEMPへ変更し、focused 25/25 PASS後に最終FULLを実行した。

skip / fixme / retry追加 / timeout延長 / 閾値緩和 / snapshot更新は行っていない。

## 最終候補のfresh Gate
実行HEADは `b0056ab471dfa76327cb6c6fefa891d852b80f9f`。全Gateの同一HEADでの実測結果。FULLではPASS cache未使用。一時bundleもbuild出力もD内で実行した。

| Gate | 結果 |
| --- | --- |
| repository ESLint / class lint / source contracts | PASS |
| App / E2E TypeScript | PASS |
| phase docs / AI handoff / privacy | PASS |
| production build / gallery excluded | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | 4,163/4,163 PASS |
| repository-wide Playwright | 439/439 PASS |
| git diff --check | PASS |
| Rust check / native tests | PASS / 62/62 PASS |

FULL: **783.7秒 / raw logs 35,339 B / 0 FAIL / 0 UNRUN**。旧Phase 13の120-case audio qualificationとEXE evidenceは `00615cfd` の履歴であり、今回再実行・再生成した結果として扱わない。

## master上のfresh確認
実行HEADは `12d2961a7406574a166524be12c23358898ccab2`。

| Gate | 結果 |
| --- | --- |
| Home + MIDI Bass Unit smoke | 23/23 PASS |
| Phase 13 product path / recording / responsive / accessibility smoke | 4/4 PASS |
| Rust check / native tests | PASS / 62/62 PASS |
| App / E2E TypeScript | PASS |
| repository / class / source lint | PASS |
| phase docs / AI handoff / privacy | PASS |
| production build / gallery excluded | PASS |
| git diff --check | PASS |

master上ではFULLを再実行していない。FULLは候補HEADの結果として記録し、merge treeが候補と完全一致することを確認した。masterの結果と候補の結果を混同しない。画面smokeが作成したfixture frontendは、その後production buildへ戻した。

## Git / privacy / 状態
masterはマージ直後tracked / untrackedともclean。候補側に元からあった未追跡のテスト監査レポート、rule-coverage調査、diagnosticsは保持し、マージ対象に含めていない。新規worktree / dependencyは追加していない。実Vault・private MIDI・実録音にはアクセスしていない。

マージ直後のcached origin/masterとの関係は0 behind / 112 ahead。リモート更新は行っていない。以後のcommitは本記録・索引・状態を更新するdocumentation-only follow-upであり、製品 / テスト / runner変更を含めない。

P13.0-01のexecution-stateにある`lastVerifiedCommit=00615cfd`とGate履歴は、audio qualification / EXEを含む当初の実装Stageの記録として保持した。今回の統合結果は[専用evidence](../evidence/master-integration.json)を正とする。以前のFINAL-REPORTにある未統合状態は本報告で更新する。

## 残る制約
実入力機器による録音精度・実音・Windows WebViewのHuman Product Acceptanceは未実施。公開合成fixtureの成功は実演奏の精度保証ではない。既存の60秒録音上限、constant 4/4、近似単音判定等の制約は維持。以前のPhase 13 EXEは旧候補用であり、今回のP12/P12.1統合済みEXEではない。
