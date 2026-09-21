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
- Evidence: `src/domain/voicing/sourceVoicing.ts`, `src/domain/voicing/extractVoicing.ts`, `src/domain/voicing/sourceVoicing.test.ts`.
- Consequences: `voicingMemory.sourceVoicing` stores the extracted pitches; preview and save share one code path.
- Do not: quantize, retime, transpose, or rewrite source notes.

## ADR-002 — Source Truth vs Harmony Interpretation vs Practice Rendering

- ID: ADR-002
- Title: Source Truth / Harmony Interpretation / Practice Rendering separation
- Status: PROPOSED
- Decision: Long-term architecture separates the source's actual notes, the analyzer's inferred chord identity, and practice-specific voicing renderings.
- Reason: Prevents practice/lesson voicing from being mistaken for source facts.
- Evidence: partial only — `voicingMemory.sourceVoicing` (source) vs `practiceVoicingOverride` (rendering seed).
- Consequences: New voicing work must not collapse these axes back into one enum.
- Do not: treat this separation as an already-shipped fact.

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
- Status: CONFIRMED (formatting) / PROPOSED (full text entry parser)
- Decision: A progression renders as a plain "| C Am F G |" text form.
- Reason: Human-readable, searchable, shareable shorthand.
- Evidence: `src/domain/progressionText.ts`, `src/domain/progressionEditing/fastLabelEntry.ts`.
- Consequences: Text formatting is deterministic; a full text-entry parser (text → chords with slash/control semantics) is not yet in committed runtime.
- Do not: assume arbitrary text parses back into chords without a confirmed parser.

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
