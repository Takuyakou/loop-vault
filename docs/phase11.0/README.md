<!-- phase-id: 11.0 -->

# Phase 11.0 — Voicing Loop v4

## Status

### P11-12 Baseline Audit

[P11-12 fingering ranker baseline audit](reports/P11-12-fingering-ranker-baseline-audit.md): audit complete on `audit/p11-12-fingering-ranker`, tested diagnostic code `7ee3ccd8`. Public synthetic only; production ranker / weights / candidates / UI / schema unchanged. 2,160 progressions; focused 146/146 PASS, added-code lint/typecheck PASS. Diagnostic outputs are local-only. No FULL/EXE or integration in this audit. Stop before implementation; P11-00–11 integration below remains unchanged.

P11-11 implementation verification: tested code HEAD `d7d10838`, fresh FULL 3,717 Vitest / 191 Playwright PASS, raw Windows EXE built. See [P11-11 report](reports/P11-11-generated-bass-audio-fingering.md). Human listening remains; candidate-only/no-merge notes are historical after the authorized integration below.

- Status: completed / P11-00–11 integrated into local master; P11-00–08 previously integrated into local master; P11-08 follow-up complete; P11-07 fixes retained; HUMAN_GATE_AFTER_P11_01 approved by the user.
- Completed stages: P11.0-00 through P11.0-11; verified commits/gates in execution-state.json.
- Phase starting base: local master 73507e87. P11-09 acceptance base: 8b6480b4. Phase 10 finish is an ancestor.
- Historical P11-06 tested HEAD: `266b24a2`; fresh FULL 3,657 Vitest / 168 Playwright PASS, raw Windows EXE built. See [final report](reports/P11-06-final.md). Historical P11-06 verification. P11-07 final tested HEAD: `2377448a`; fresh FULL 3,668 Vitest / 174 Playwright PASS, updated runnable EXE. Stop for Human Product Acceptance; no master merge.

## Current integration (P11-11)

Human-authorized merge `f86846bc`: candidate tree matches exactly; fresh post-merge focused 293/293 PASS, phase-doc / AI-handoff / privacy / diff PASS. [Integration report](reports/P11-11-master-merge.md). The earlier full verification remains tied to tested code HEAD `d7d10838`; FULL was not rerun on the merge HEAD. No push/tag/release.

## Previous integration (P11-09/10)

Human-authorized merge / fresh-tested HEAD `f7768617`: 3,694 Vitest / 189 Playwright PASS, 0 FAIL / 0 UNRUN, cache unused. [Integration report](reports/P11-09-10-master-merge.md). P11-09/10 candidate stop-before-merge notes below are historical. No push/tag/release or new stage.

## Completed follow-up

[P11-10](P11-10.md): completed, Source availability banner removal and fixed-source generated-controls gating. [Evidence](reports/P11-10-source-availability-generated-controls.md). Preserve completed P11-09. Final fresh FULL at `b0fe8076`: 3,694 Vitest / 189 Playwright PASS, raw EXE built. Stop for acceptance; no master merge.

## Human Acceptance follow-up

[P11-07](P11-07.md) combines the authorized Range shortcuts/Space/timeline fix with the current chord panel mock. Evidence: [acceptance report](reports/P11-07-human-acceptance.md).

[P11-08](P11-08.md) restores compact Next Move and fixes native details dismissal. Previous hiding decision is superseded by the latest human request. Historical P11-08 tested / EXE HEAD: `55aa6c67`; fresh FULL 3,670 Vitest / 177 Playwright PASS. Current evidence: [follow-up report](reports/P11-08-details-next-move.md).

[P11-09](P11-09.md) is the completed scoped follow-up. Tested / EXE HEAD `53682f69`, fresh FULL 3,687 Vitest / 186 Playwright PASS. [Current report](reports/P11-09-acceptance-layout-source-hands.md). No master merge in this stage.

## Local master integration (P11-00–08 history)

User-authorized merge completed at `52159ae6`. Fresh FULL on that merge HEAD: 3,670 Vitest / 177 Playwright PASS, 0 FAIL / 0 UNRUN. [Integration report](reports/P11-master-merge.md) is the current Git/verification record; earlier no-merge notes describe the implementation run.

## Required Reading Order

1. Root AGENTS.md and docs/ai-handoff/README.md / HANDOFF.md.
2. This README and execution-state.json.
3. [work-instructions.md](work-instructions.md).
4. [PHASE-11-CONTRACT-v4.md](PHASE-11-CONTRACT-v4.md).
5. [P11-00.md](P11-00.md), then [P11-01.md](P11-01.md).
6. [reports/README.md](reports/README.md).

## Stages

- P11.0-00: Audit and freeze without product behavior change.
- P11.0-01: Session-only A–B range loop, focused validation, screenshots.
- HUMAN_GATE_AFTER_P11_01: approval of generated migration/naming and range result.
- P11.0-02 through P11.0-06: authorized in order. Generated primary types: 基本 / 骨組み; preserve other controls in 詳しい設定.

## Safety

Root AGENTS.md governs Git and privacy. No merge, push, tag or release in this run. No Vault schema change. Reports are Japanese and product decisions state 選んだこと / 理由 / 別案.
