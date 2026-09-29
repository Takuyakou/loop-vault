<!-- phase-id: 9.5 -->

# Phase 9.5 — Candidate Ranking v2 research

Git and current code are authoritative. This package covers only the separately assigned P9.5 stage.

## Status

- Status: completed
- Active stage: none
- Branch: research/phase9-core-v2
- Completed stage: P9.5-00 (fresh FULL tested HEAD b82e9f48b6cba325df63308c21b044b4cdd839c3).
- Next action: STOP after P9.5; P9.6 requires separate assignment.

## Required Reading Order

1. [work-instructions.md](work-instructions.md)
2. [execution-state.json](execution-state.json)
3. [Phase 9 architecture freeze](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md)
4. [P9.4 scoring report](../phase9.4/reports/P9.4-tier2-scoring-contract.md)
5. [reports/README.md](reports/README.md)

## Stages

P9.5-00: compare local ranking components on a fixed candidate set, separate full accepted Tier 2 Gold from Harmony structural proxy, calibrate UNKNOWN on public authored controls, freeze one dev policy, evaluate validation once, and report candidate-versus-ranking losses. Research only.

## Safety

Follow root AGENTS.md. Do not use private witness or sealed holdout for ranking selection. No Product `src/**` changes, Vault migration, decoder switch, merge, push, tag, release, or P9.6 in this assignment.
