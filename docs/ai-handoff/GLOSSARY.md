# Loop Vault — Glossary

When to read:
Read when a term is unclear.

Do not preload:
This is a reference, not a workflow.

Each term is marked `Confirmed` (backed by current code/spec) or `Proposed`
(future direction only).

## Chord / harmony

- Source MIDI (Confirmed): the imported `.mid` / `.midi` file whose notes are the origin of an analysis.
- Source Voicing (Confirmed): the original pitches/octaves extracted for a chord; stored as `voicingMemory.sourceVoicing`.
- Source Bassline (Confirmed): a selected bass voice captured as `SourceBasslineSnapshotV1` with exact beats and captured harmony spans.
- Generated Voicing (Confirmed): a voicing produced by the practice generators (shell / open / rootless / style).
- Custom Voicing (Confirmed): a user-edited voicing.
- Voicing Memory (Confirmed): per-chord slots `sourceVoicing` + `practiceVoicingOverride` that preserve sounding pitches.
- Chord Identity (Confirmed): the root/quality/tensions/bass symbol (`ChordSymbol`) the analyzer or user assigned.
- Harmony Event (Confirmed): a timeline chord cell (`ChordTimelineItem`) with bar/beat/duration/chord.
- Slash Bass (Confirmed): a chord symbol with an explicit bass note distinct from the root (e.g. `C/E`).
- Degree (Confirmed): a scale degree used by degree practice.
- Harmonic Function (Proposed): functional role of a chord; not a runtime classification yet.
- Harmonic Core (Proposed): a named subsystem proposed on an unmerged branch; not present in committed code.

## Voicing rules / practice vocabulary

- Voicing Rule (Confirmed): a deterministic voicing family with source / study / coverage / context / provenance axes (`src/domain/voicingRules/`).
- Study Category (Confirmed): `teacher` / `core` / `color` / `open`; the runtime base study is `teacher` or `core`, with color/open as modifiers.
- Coverage (Confirmed): `literal` / `performance-reduction` / `creative-enrichment` — how closely a voicing matches the source.
- Provenance (Confirmed): where a rule came from (teacher evidence, external theory, analysis proposal, legacy product rule).
- Literal (Confirmed): render the exact source pitches.
- Performance Reduction (Confirmed): a playable reduction with explicit omissions.
- Creative Enrichment (Confirmed): added tones, with additions made explicit.
- Progression Voicing Practice (Confirmed): the Voicing Loop surface (`src/domain/progressionVoicingPractice/`) with a practice clock and voicing resolution.
- Text Progression Entry (Confirmed): parsing a text progression back into chord events (`src/domain/textProgression.ts`).

## Analysis

- Voice Role (Confirmed): inferred role of a MIDI voice — bass / harmony / pad / melody / percussion / mixed.
- Analyzer (Confirmed): the deterministic symbolic pipeline that scores note windows against chord templates.
- Candidate Block (Confirmed): a 4/8/16-bar progression candidate selected from the timeline.
