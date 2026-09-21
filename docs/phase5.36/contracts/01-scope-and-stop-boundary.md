# Contract 01 — Scope / Stop Boundary

## Authorized

- `docs/phase5.36/**`
- `scripts/p536/**`
- test-only/shadow pure helpers
- deterministic synthetic fixtures
- ignored local LF-MIDI-001 evaluation
- privacy-safe reports

## Forbidden production diffs

No intentional production changes in MIDI parsing/import, meter handling, boundary engine, candidate generation, ranking/scoring, default analyzer, Vault schema/fileVersion, playback/audio, Source Voicing/Source Bassline, Voicing Rules/Loop, Text Progression, UI, MIDI export.

## Stop

P5.36 ends with causal validation and a P5.37 proposal only. Do not create/start P5.37 automatically.
