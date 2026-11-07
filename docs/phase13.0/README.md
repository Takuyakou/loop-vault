# Phase 13.0 — Bass Practice
<!-- phase-id: 13.0 -->

## Status
P13.0-01 implementation integrated into local master at `12d2961a7406574a166524be12c23358898ccab2`. FULL tested candidate: `b0056ab471dfa76327cb6c6fefa891d852b80f9f`. P12/P12.1 preserved; real-interface acceptance remains pending. See [master integration](reports/MASTER-INTEGRATION.md).

## Required Reading Order
1. [AGENTS.md](../../AGENTS.md)
2. [Work instructions](work-instructions.md)
3. [Execution state](execution-state.json)
4. [Audit](audit/baseline.md)
5. [Reports](reports/README.md)

## Scope
Existing four-mode UI renewal, separate MIDI bass library, post-record analysis, local verification and runnable Windows EXE. Vault stays v2. Legacy recordings are not analyzed.

## Stages
### P13.0-01
Subsections 0 audit, 1 shared frame, 2 library, 3 playback/recording, 4 analysis and fixture qualification, 5 integration and gates.

## Gates
Focused regressions, audio qualification, fresh FULL, native storage tests and Windows build.

## Stop Conditions
Real-interface acceptance is not verified by synthetic tests. Further implementation requires a separate task.

## Resume
Local master integration is complete. [Original implementation report](reports/FINAL-REPORT.md) and its EXE evidence remain historical; use the integration report for current Git state. Human acceptance of real input is pending.
