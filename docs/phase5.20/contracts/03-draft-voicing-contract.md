<!-- phase-id: 5.20 -->
# Contract 03 — Draft / Voicing

## Draft bridge

P5.20 converts a valid transient parse result into the existing session-only
`ManualCandidateDraft`, then reuses its Quick Editor, boundary editing,
Undo/Redo, preview, and normal save bridge. The text source is session-only;
it must not fabricate MIDI analysis, analyzer confidence, source asset, source
path, filename, fingerprint, or persisted `origin` value.

## Auto Voicing

Each selected text card uses existing deterministic `voiceChordForPreview()`
and must be labelled **Auto** or **Generated**. This is per-chord generation;
it is not claimed to be source MIDI, progression-wide voice-leading, common-tone
optimisation, or a persistent original voicing.

## Custom Voicing determination: AUTHORIZED

Existing `practiceVoicingOverride` already stores exact sorted MIDI notes, bass
note, chord identity, representation, and explicit `live-played` provenance
under the current strict fileVersion 1 schema. P5.20 may expose the existing
Live MIDI capture action through the selected-card `VoicingPanel`, with
`sourceAvailable={false}` and the normal `setEditableVoicingMemory()` Draft
bridge. No new storage, schema, migration, source-MIDI extraction, or
click-to-compose note editor is permitted. A changed chord identity drops a
stale override through existing compatibility checks.
