# Loop Vault Current State

## 再開位置

- Active instructions: [`docs/phase5.15/ACTIVE-WORK-INSTRUCTIONS.md`](phase5.15/ACTIVE-WORK-INSTRUCTIONS.md)
- Runtime policy amendment: [`docs/phase5.15/00-runtime-policy-amendment.md`](phase5.15/00-runtime-policy-amendment.md)
- Current branch: `fix/p515-01-exact-evidence-dedup`
- Stage 01 checkpoint base / amendment parent: `b1862816f8d8d80f8d04f72eb3ee919007f33cd5`
- Last completed stage: P5.15-00（上記 commit。再実行しない）
- Active stage: P5.15-01 Exact Note Evidence Dedup
- State: 未コミット変更を保持した安全な checkpoint。追補 commit 後、この地点から再開する

P5.15-00 の GitHub push / PR は、GitHub への明示的な export 承認と `gh` 再認証待ちである。main には merge していない。

## P5.15-01 完了済み作業

- exact note evidence dedup の実装と evaluator を作成
- case 02: 33 notes → 33 effective notes
- case 03: 66 notes → 33 effective notes
- case 02 / 03 normalized deep equal: PASS
- case 12 / 15 / 32 の intentional unison / voice evidence を保持
- safe suites 10/10、317 files × 11 OFF/ON conditions を評価し、correctness regression 0
- fresh Phase 4.7 Holdout: 未評価・未開封
- memory、privacy、temporary artifact gates: PASS

## 実行済み検証

- targeted tests: 52/52 PASS
- full Vitest: 265 files / 2075 tests PASS
- lint: PASS
- `typecheck:p515`: PASS
- `git diff --check`: PASS

## 再開時に残る作業

1. Stage 01 report schema の cross-field / top-level PASS 算術を強化し、exact count の不整合が false PASS にならないことを保証する
2. runtime 判定を P5.15-00 の frozen Stable baselines と lock 由来の exact 40-file selection に接続する
3. Runtime Policy Amendment に従い、Stable runtime Gate と Accuracy First の採用判定を分離する
4. targeted / stage gates、review、明示 path staging、Stage 01 commit を完了する

## Runtime Policy Amendment の適用要約

Phase 5.15 は、correctness、既存正解ケースの非退行、deterministic / reproducibility、データ・Git・resource safety、runtime の順で優先する。runtime 改善は P5.15-01 の必須採用条件ではない。既存の「3分MIDI 10秒Gate」は Stable profile だけに適用し、Accuracy First では 10秒超だけを failure としない。正式な全文は active instructions と amendment 文書を参照する。

## 保護契約

- `fileVersion = 1`
- Vault schema、UI、MIDI Exporter、raw MIDI、Piano Roll source notes、保存データは変更しない
- tracked MIDI: 0
- tracked `.local-evaluation`: 0
- build output: 0
- fresh Phase 4.7 Holdout は P5.15-06 まで開かない
- `.agents/`、`.claude/`、`docs/loop-vault-codex-continuity-kit/` は user-owned として触れない
- `git add -A`、reset、stash、force push、history rewrite、main merge を行わない
