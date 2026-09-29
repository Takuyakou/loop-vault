<!-- phase-id: 9.0 -->

# Phase 9.0 — Work instructions

## Goal

Freeze a reproducible research foundation for Architecture A without integrating Core v2 into Product.

## Scope

Audit current repository behavior and existing P7/P8 evidence; define a research-side Core Result; measure current Product on available independent Gold; create deterministic usage-profile and metamorphic generators; validate comparison provenance; seal a distribution-shifted future holdout; freeze numeric guardrails before P9.2.

## Non-goals

No Product Core change, Vault schema change, private witness tuning, Live MIDI work, or holdout evaluation. Later P9 stages are not part of this assignment.

## Contracts

Use the [architecture freeze candidate](contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md). Surface contradictions explicitly. The [Core Result contract](contracts/core-result-contract.md) is research-only. Reports shall state the exact provenance and unavailable metrics; a proxy must never be labeled as a full contract result.

## Stages

P9.0 covers the supplied P9.0-00 through P9.0-10 tasks in one repository stage: audit, contract, exclusion audit, baseline, generators, provenance validator, holdout seal, threshold freeze, final report. The required report is [`P9.0-final-report.md`](../phase9/P9.0-final-report.md); the top-level path preserves the supplied package's report naming while the phase directory follows the repository's `phaseX.Y` validator contract.

## Definition of Done

P9.0 can close only after deterministic tests, reproducible baseline commands, phase-doc/AI-handoff validation, privacy/security checks, no Product `src/**` diff, and a fresh stage-candidate FULL Gate. Each gate and final commit hash must be recorded in `execution-state.json`; never claim PASS from an earlier HEAD.

## Safety

Follow root `AGENTS.md`. Holdout contents and opening marker stay local-only. No production behavior, schema, merge, push, tag, or release change.
