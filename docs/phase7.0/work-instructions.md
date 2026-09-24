<!-- phase-id: 7.0 -->

# Phase 7.0 — Work Instructions

## Goal

Compare Core v2 research candidates against independent source, role, temporal, harmonic, persistence, and playback truth. Deliver an evidence-based reference architecture and Phase 8 plan. Do not integrate Core v2 into production.

## Scope

The supplied [master instructions](01-PHASE7-MASTER-INSTRUCTIONS.md), [stage plan](02-PHASE7-STAGES.md), [evaluation contract](03-PHASE7-EVALUATION-CONTRACT.md), and [experiment matrix](04-PHASE7-EXPERIMENT-MATRIX.md) define research questions and measures. The supplied documents use short stage IDs `P7-00` through `P7-11`; this repository's phase schema records the same stages as `P7.0-00` through `P7.0-11`.

## Non-goals

No production Core v2 integration, default analyzer change, Vault schema or fileVersion change, migration, Live MIDI production change, MIDI Export contract change, or production UI implementation.

## Contracts

Use the supplied [evaluation contract](03-PHASE7-EVALUATION-CONTRACT.md), [experiment matrix](04-PHASE7-EXPERIMENT-MATRIX.md), and [local private data policy](05-PHASE7-LOCAL-PRIVATE-DATA-POLICY.md). Root `AGENTS.md` governs repository safety.

## Stages

Follow [the ordered stage plan](02-PHASE7-STAGES.md). Each stage records its own evidence and gates before the next begins. The final stage produces the [final report](06-PHASE7-FINAL-REPORT-TEMPLATE.md) and stops.

## Definition of Done

Each stage has a report, executed gates recorded as pass, and a corresponding commit. No result is claimed from an earlier HEAD. The final decision uses Tier 1, Tier 2, correction cost, category behavior, interaction, runtime, and sealed holdout evidence.

## Safety

Follow root `AGENTS.md`. Keep private MIDI and local evaluation artifacts out of Git and reports.
