<!-- phase-id: 9.4 -->

# Phase 9.4 — Tier 2 Scoring Contract

Git and current code are authoritative. This package covers only the separately assigned P9.4 stage.

## Status

- Status: in progress
- Active stage: P9.4-00
- Branch: research/phase9-core-v2
- Next action: freeze the scoring contract, then run public validation once.

## Required Reading Order

1. [work-instructions.md](work-instructions.md)
2. [execution-state.json](execution-state.json)
3. [Phase 9 architecture freeze](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md)
4. P8.6 research report in `research/phase8-foundation` (historical branch)
5. [P7 harmonic truth](../../scripts/p7/harmonicTruth.ts)
6. [reports/README.md](reports/README.md)

## Stages

P9.4-00: freeze a research-only full Tier 2 scoring contract; re-score P8.6 candidates under the authored source-note oracle on public dev then validation; distinguish independent semantic truth from audible renderer output and unavailable metrics. No local ranking tuning or production integration.

## Safety

Follow root AGENTS.md. No private witness, sealed holdout, Product `src/**` change, Vault migration, merge, push, tag, release, or P9.5 in this stage.
