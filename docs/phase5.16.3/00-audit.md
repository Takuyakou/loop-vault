# P5.16.3-00 Audit

## Baseline

- Base: P5.16.2 release-gate commit `61e3162`.
- Practice data is isolated in `loopvault/practice-v1.json`; current Degree and Rhythm collections must remain backward compatible.
- Vault progressions are represented by saved, structured chord blocks. Their original MIDI path, raw MIDI and memo must not be copied into a practice snapshot.

## Decision

Bassline Echo will use a separate typed exercise/attempt collection rather than widening the Degree `PracticeExercise` union. Vault input is converted into a read-only normalized snapshot containing only progression ID, key, tempo, meter, chord labels/roots/durations and a minimal label.

## Safety

- Vault mutation: zero.
- Analyzer and MIDI Exporter: unchanged.
- Source MIDI Bass: audit only; no implementation in this phase because the read-only Bass role provenance contract cannot be guaranteed from the saved progression schema alone.