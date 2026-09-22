# Loop Vault P5.34 — MIDI Import Failure Isolation

## Purpose
This is a diagnostic/failure-isolation phase for `LF-MIDI-001`.
Do not start by fixing MIDI Import, changing Analyzer behavior, or implementing Preserve-first.

Before editing:
1. inspect Git reality;
2. read root `AGENTS.md`;
3. read `docs/ai-handoff/README.md`, `HANDOFF.md`, `KNOWN-FAILURES.md`, `DECISIONS.md`;
4. verify P5.34 is not already allocated;
5. read this package README, execution-state, work-instructions, relevant contracts;
6. inspect current code/tests.

## Phase-number collision
This package assumes P5.34 because P5.33 is already on trunk per accepted handoff.
If `docs/phase5.34/` or another P5.34 allocation already exists, STOP and report the collision.
Do not overwrite or silently renumber.

## Authorized
- phase docs
- diagnostic scripts
- test/shadow-only pure helpers
- deterministic synthetic fixtures
- ignored local private-MIDI evaluation
- reports

## Forbidden
- production MIDI import/analyzer behavior changes
- default analyzer changes
- Vault schema/fileVersion changes
- playback/UI changes
- production feature flags
- automatic 1/4→4/4 repair
- production onset tolerance
- Preserve-first/sourcePerformance implementation
- ranking promotion
- merge/push/tag/release

## Final state
`PASS — FAILURE ISOLATION COMPLETE; IMPLEMENTATION PLAN READY`
or `BLOCKED — <reason>`, then STOP.
