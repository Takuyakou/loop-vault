# Loop Vault — Decisions

When to read:
Read when you need to know why a boundary exists before changing it.

Do not preload:
Not needed for UI-only or test-only tasks.

Each decision records its status. Only `CONFIRMED` items are backed by current
code/tests; `PROPOSED` items are direction only.

---

## ADR-001 — Source MIDI Exactness

- ID: ADR-001
- Title: Source MIDI Exactness
- Status: CONFIRMED
- Decision: When a chord is auditioned or saved from source MIDI, the original pitches/octaves are used as-is.
- Reason: The chord the user hears must be the chord they save.
- Evidence: `src/domain/voicing/`, `src/domain/voicing/sourceVoicing.ts`, `src/domain/sourceBassline/`.
- Consequences: `voicingMemory.sourceVoicing` and `SourceBasslineSnapshotV1` store exact source pitches/beats; preview and save share one code path.
- Do not: quantize, retime, transpose, or rewrite source notes.

## ADR-002 — Source Truth vs Harmony Interpretation vs Practice Rendering

- ID: ADR-002
- Title: Source Truth / Harmony Interpretation / Practice Rendering separation
- Status: CONFIRMED (realized; still evolving)
- Decision: The architecture separates the source's actual notes/timing, the analyzer's inferred chord identity and voicing rules, and practice-specific rendering.
- Reason: Prevents practice/lesson voicing from being mistaken for source facts.
- Evidence: `src/domain/sourceBassline/` (truth), `src/domain/voicingRules/` + `src/domain/midi/` (interpretation), `src/domain/progressionVoicingPractice/` (rendering).
- Consequences: New voicing work must not collapse these axes back into one enum.
- Do not: label a practice rendering as a source fact.

## ADR-003 — Voicing Memory two-slot design

- ID: ADR-003
- Title: Voicing Memory two-slot design
- Status: CONFIRMED
- Decision: Each chord timeline item carries optional `sourceVoicing` and `practiceVoicingOverride` snapshots.
- Reason: Keep the original and the user's practice override independent and non-destructive.
- Evidence: `src/domain/types.ts` (`ChordVoicingMemory`, `VoicingSnapshot`), `src/domain/schema.ts`.
- Consequences: Practice/transposition/mix can read source separately from the override; both are deep-cloned when copied.
- Do not: merge the two slots into one.

## ADR-004 — Simple Text Contract

- ID: ADR-004
- Title: Simple Text Contract for progressions
- Status: CONFIRMED
- Decision: A progression renders as a plain "| C Am F G |" text form, and text parses back into chord events (slash / control semantics included).
- Reason: Human-readable, searchable, shareable shorthand.
- Evidence: `src/domain/progressionText.ts`, `src/domain/textProgression.ts`, `src/domain/textScoreTokenizer.ts`.
- Consequences: Text entry and text formatting are both deterministic and covered by tests.
- Do not: assume arbitrary text parses without the confirmed parser.

## ADR-005 — Default analyzer rollback to phase4-v1

- ID: ADR-005
- Title: Default analyzer rollback to `phase4-v1`
- Status: CONFIRMED
- Decision: The product default analyzer is `phase4-v1`; `phase4.1-v1` was rolled back because its coverage gates measured reach, not usefulness.
- Reason: The top candidates collapsed to the same pattern at different positions.
- Evidence: `src/domain/midi/analysis.ts` (`defaultAnalyzerMode`).
- Consequences: Alternative analyzers remain selectable for evaluation but are not the default.
- Do not: re-promote `phase4.1-v1` without re-checking usefulness, not just coverage.

## ADR-006 — Private MIDI / audio policy

- ID: ADR-006
- Title: Private MIDI / audio never tracked
- Status: CONFIRMED
- Decision: Real recordings, external/private MIDI, and personal absolute paths are never committed.
- Reason: Licence and privacy.
- Evidence: `scripts/check-staged-files.mjs`, `scripts/phase-docs/lib.mjs`, `.gitignore`.
- Consequences: `.local-evaluation/` and `test/private-midi/` are ignored; synthetic fixtures live under `test/fixtures/`.
- Do not: commit raw audio/MIDI or `.local-evaluation` inputs.

## ADR-007 — Source Bassline exact-beat capture

- ID: ADR-007
- Title: Source Bassline exact-beat capture
- Status: CONFIRMED
- Decision: A selected bass voice is captured as `SourceBasslineSnapshotV1` with exact beats and captured harmony spans; identity and raw ticks stay transient.
- Reason: Preserve the source bassline as source truth rather than re-deriving it from analysis.
- Evidence: `src/domain/sourceBassline/types.ts`, `src/domain/sourceBassline/snapshot.ts`.
- Consequences: Meter is captured as proven 4/4 with raw-integer-tick authority; transient identity never enters the persisted snapshot.
- Do not: extend source bassline to all polyphonic voices without a separate decision.
