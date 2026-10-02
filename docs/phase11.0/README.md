<!-- phase-id: 11.0 -->

# Phase 11.0 — Voicing Loop v4

## Status

- Status: in-progress / P11-09 Human Acceptance follow-up; P11-00–08 previously integrated into local master; P11-08 follow-up complete; P11-07 fixes retained; HUMAN_GATE_AFTER_P11_01 approved by the user.
- Completed stages: P11.0-00 through P11.0-08; verified commits/gates in execution-state.json.
- Base: local master 73507e87. Phase 10 finish is an ancestor.
- Historical P11-06 tested HEAD: `266b24a2`; fresh FULL 3,657 Vitest / 168 Playwright PASS, raw Windows EXE built. See [final report](reports/P11-06-final.md). Historical P11-06 verification. P11-07 final tested HEAD: `2377448a`; fresh FULL 3,668 Vitest / 174 Playwright PASS, updated runnable EXE. Stop for Human Product Acceptance; no master merge.

## Human Acceptance follow-up

[P11-07](P11-07.md) combines the authorized Range shortcuts/Space/timeline fix with the current chord panel mock. Evidence: [acceptance report](reports/P11-07-human-acceptance.md).

[P11-08](P11-08.md) restores compact Next Move and fixes native details dismissal. Previous hiding decision is superseded by the latest human request. Latest tested / EXE HEAD: `55aa6c67`; fresh FULL 3,670 Vitest / 177 Playwright PASS. Current evidence: [follow-up report](reports/P11-08-details-next-move.md).

[P11-09](P11-09.md) is the active scoped follow-up. [Current report](reports/P11-09-acceptance-layout-source-hands.md). No master merge in this stage.

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
