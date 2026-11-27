<!-- phase-id: 5.18 -->

# Contract 04 — P5.17 Record & Compare Integration

## Reuse boundary
P5.18 reuses P5.17 `RecordCompareSection`, `RecordingSessionController`,
`TargetPlayer`/`TakePlayer`, channel settings, permission flow, and IndexedDB
take store. It creates no second recorder, take repository, binary store, or
Practice/Vault audio field.

## Recording and listen-back
Chords only or Chords + Metronome may run during recording, but application
output is never internally mixed into the captured take. There is no app-side
live input monitoring. Headphones guidance is factual and optional.

Target and My Take remain exclusive playback modes. P5.18 must stop/release
its accompaniment before either is played, preserve P5.17 cleanup behavior,
and add no automatic analysis or scoring.

## Factual history
A later P5.18 history record may keep only source type/reference/safe label,
snapshot signature, selected section, original/effective BPM, selected
Listen/Play modes, metronome use, Record & Compare use, and retained-take
reference. It never stores score, inferred ability, raw audio, source path, or
captured-device details.