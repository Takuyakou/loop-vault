# Phase 5.14 MIDI Format and Voicing

## Format contract

- SMF format: 1
- PPQ: 480 fixed
- Track 0: tempo, time signature, chord markers
- Track 1: note on/off events
- Clip origin: the first saved event is normalized to tick 0
- Beat conversion: each absolute beat position is rounded independently
- Shared boundary order: note-off before note-on
- Velocity: 96 fixed because the Vault schema has no velocity field
- N.C.: silent duration with no note events

The click-save and native-drag paths both receive the same
`ProgressionMidiExportResult.bytes`. MIDI event construction is not duplicated
in UI or Rust.

## Voicing priority

1. compatible `practiceVoicingOverride` (`edited`)
2. compatible verified or automatic `sourceVoicing` (`saved`)
3. deterministic `voiceChordForPreview()` fallback (`generated`)

Mixed sources are reported as `mixed`. Slash chords require the lowest MIDI
note to match the stored bass pitch class. A mismatch stops the whole export;
events are never silently omitted.

## Fallback metadata

- BPM: 96 with `bpm-fallback` warning
- Meter: 4/4 with `time-signature-fallback` warning

The MIDI payload contains chord labels as markers. It does not serialize Idea
titles, source file paths, memos, tags, or Vault metadata.

## Coverage

All 21 `ChordQuality` values can be voiced and serialized. The exporter has no
unsupported stored chord quality in the current public schema. Invalid
duration, position, pitch, velocity, missing voicing, and slash-bass mismatch
remain explicit terminal errors with an event index where available.

