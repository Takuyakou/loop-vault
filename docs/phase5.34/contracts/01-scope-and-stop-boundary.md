# Contract 01 — Scope / Stop Boundary
Authorized: docs, diagnostics, test/shadow-only helpers, synthetic fixtures, ignored local evaluation, reports.

No intentional production behavior diff in MIDI parsing/import, default Analyzer, ranking, production boundaries, persistence/schema/fileVersion, playback/audio, Source Voicing, Source Bassline, Voicing Rules, Voicing Loop, Text Progression, UI, export.

If a pure helper must be extracted from production code, it must be behavior-neutral, focused-tested, and explicitly reported. Prefer scripts/tests.

P5.34 stops after causal isolation + next-plan creation. No fix phase starts automatically.
