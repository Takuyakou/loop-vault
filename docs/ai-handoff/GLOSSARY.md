# Loop Vault — Glossary

When to read:
Read when a term is unclear.

Do not preload:
This is a reference, not a workflow.

Each term is marked `Confirmed` (backed by current code/spec) or `Proposed`
(future direction only).

## Architecture layers

- Source Truth (Proposed architectural term): facts observed/kept directly from a source. Current code contains confirmed building blocks for this role (`sourceVoicing`, `Source Bassline`), but no repository-wide contract.
- Harmony Interpretation (Proposed architectural layer): harmonic estimates produced by the analyzer (chord identity, segmentation, ranking).
- Practice Rendering (Proposed architectural layer): practice voicings derived from chord identity / rules (Voicing Rules, Progression Voicing Practice).

## Chord / harmony

- Source MIDI (Confirmed): the imported `.mid` / `.midi` file whose notes are the origin of an analysis.
- Source Voicing (Confirmed): a per-chord `voicingMemory.sourceVoicing` snapshot of exact pitch/octave (`midiNotes`, `bassNote`); it does not carry timing.
- Source Bassline (Confirmed): a selected bass voice captured as `SourceBasslineSnapshotV1` with exact-beat start/duration and velocity; 4/4, bass-specific, not full polyphonic source.
- Generated Voicing (Confirmed): a voicing produced by the practice generators (shell / open / rootless / style).
- Custom Voicing (Confirmed): a user-edited voicing.
- Voicing Memory (Confirmed): per-chord slots `sourceVoicing` + `practiceVoicingOverride` that preserve sounding pitches.
- Chord Identity (Confirmed): the root/quality/tensions/bass symbol (`ChordSymbol`) the analyzer or user assigned.
- Harmony Event (Confirmed): a timeline chord cell (`ChordTimelineItem`) with bar/beat/duration/chord.
- Slash Bass (Confirmed): a chord symbol with an explicit bass note distinct from the root (e.g. `C/E`).
- Degree (Confirmed): a scale degree used by degree practice.
- Harmonic Function (Proposed): functional role of a chord; not a runtime classification yet.

## Analysis / contribution

- Voice Role (Confirmed): inferred role of a MIDI voice — bass / harmony / pad / melody / percussion / mixed.
- Analyzer (Confirmed): the deterministic symbolic pipeline that scores note windows against chord templates.
- Candidate Block (Confirmed): a 4/8/16-bar progression candidate selected from the timeline.
- Harmonic Core (Confirmed): an opt-in pre-analysis contribution preset (`VoiceContributionPreset = "standard" | "harmonic-core"`) that emphasizes harmony/pad and down-weights melody-like notes while excluding bass/percussion/melody; implemented in `src/domain/midi/harmonicCoreNoteWeights.ts` and the pre-analysis UI.

## Voicing rules / practice vocabulary

- Voicing Rule (Confirmed): a deterministic voicing family with source / study / coverage / context / provenance axes (`src/domain/voicingRules/`).
- Study Category (Confirmed): `teacher` / `core` / `color` / `open`; the runtime base study is `teacher` or `core`, with color/open as modifiers.
- Coverage (Confirmed): `VoicingCoverage` = `literal` / `performance-reduction` / `creative-enrichment`.
- Literal (Confirmed): a coverage level that includes the complete literal pitch classes of the chord (no omissions, no enrichment). It is about chord-tone coverage, not exact source MIDI pitches.
- Performance Reduction (Confirmed): a coverage level with explicit omissions (`omittedDegrees`).
- Creative Enrichment (Confirmed): a coverage level with added tones (`addedDegrees`).
- Provenance (Confirmed): where a rule came from (teacher evidence, external theory, analysis proposal, legacy product rule).
- Progression Voicing Practice (Confirmed): the Voicing Loop surface (`src/domain/progressionVoicingPractice/`) with a practice clock and voicing resolution.

## Text input

- Text Progression Entry (Confirmed): parsing a text progression into chord identity + timing semantics (`src/domain/textProgression.ts`). It is not an exact MIDI performance representation: it does not recover pitch voicing, octave, doubling, hand allocation, or exact note timing.
