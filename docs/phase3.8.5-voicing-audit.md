# Phase 3.8.5 Voicing Audit

## MIDI data lifetime

`analyzeMidiBytes()` in `src/store/vaultStore.ts` currently stores only
`MidiProgressionAnalysis`. The analysis contains chord timelines and source
metadata, but not the parsed `TimedNote[]` or `Voice[]`. Voicing extraction at
Capture save therefore needs an ephemeral parsed-MIDI context in
`AnalysisState`; it must not be part of `VaultFile`.

## Source re-resolution

Saved blocks already retain `sourceAssetId`, `sourceFingerprint`,
`sourceStartBeat`, and `sourceEndBeat`. Ideas retain MIDI assets with an
optional path. Progression Detail can resolve the matching asset path and read
the source through the existing Tauri filesystem plugin. Missing or moved
files must remain a recoverable UI error.

## Voice role evidence

`src/domain/midi/voices.ts` builds deterministic `Voice[]` values with
track/channel identity, inferred role, confidence, pitch range, and measured
evidence. Percussion is represented explicitly. This is sufficient for soft
voicing-extraction weights without changing the MIDI analyzer mode.

## Playback

`src/audio/playbackController.ts` is the single playback coordinator.
`PlaybackRequest` currently accepts only chord symbols or timelines, and
`src/audio/chordPreview.ts` always generates preview notes through
`voiceChordForPreview()`. Phase 3.8.5 must extend these APIs with optional
explicit MIDI notes while keeping Quick Editor requests generated.

## Live MIDI ownership

`defaultLiveMidiStore` owns the shared `LiveMidiService`. It exposes held notes
through `LiveNoteState` and activates the preferred input. Progression Detail
must reuse this store, only record held notes, require 100 ms stability, and
require explicit confirmation. A recording session may activate the shared
store, but should deactivate it only when it started the connection.

## Persistence and compatibility

Voicing memory belongs on each persisted `ChordTimelineItem`, keyed by stable
`eventId`. All additions remain optional, `fileVersion` remains 1, old vaults
load without migration, and generated fallback voicings are never persisted.

## PXF / Chord Drip

No PXF or Chord Drip transport change is required. The existing clipboard
export remains chord-symbol based. Phase 3.8.5 only reserves source enum values
for future integration.
