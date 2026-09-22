# Loop Vault — Decisions

When to read:
Read when you need to know why a boundary exists before changing it.

Do not preload:
Not needed for UI-only or test-only tasks.

Each decision records its status. Only `CONFIRMED` items are backed by current
code/tests; `PROPOSED` items are direction only.

---

## ADR-001 — Source Voicing / Source Bassline exactness scope

- ID: ADR-001
- Title: Source exactness is scoped to the existing snapshots
- Status: CONFIRMED (scoped)
- Decision: The stored source snapshots are used as-is rather than regenerated. `sourceVoicing` keeps a chord-unit pitch/octave snapshot; `Source Bassline` keeps a selected bass voice with exact beats.
- Reason: The chord the user hears must be the chord they save, without regenerating pitches.
- Evidence: `src/domain/voicing/` (`sourceVoicing`), `src/domain/sourceBassline/` (`SourceBasslineSnapshotV1`).
- Consequences: `sourceVoicing` does not carry timing; `Source Bassline` is selected-bass-only and 4/4. Neither is a general full-polyphonic source-performance snapshot.
- Do not: claim "whole imported MIDI performance is persisted exactly"; do not quantize/retime/transpose/rewrite the stored source notes.

## ADR-002 — Source Truth vs Harmony Interpretation vs Practice Rendering

- ID: ADR-002
- Title: Three-layer architecture contract
- Status: PROPOSED
- Decision: A repository-wide separation of Source Truth, Harmony Interpretation, and Practice Rendering is the intended direction.
- Reason: Keeps practice/lesson voicing from being mistaken for source facts.
- Evidence: relevant building blocks already exist and are CONFIRMED — `src/domain/voicing/` (source voicing), `src/domain/sourceBassline/` (source bassline), `src/domain/midi/` (analyzer), `src/domain/voicingRules/` + `src/domain/progressionVoicingPractice/` (rendering).
- Consequences: The building blocks exist independently, but the unifying contract — and its extension to full MIDI import fidelity — is not yet realized.
- Do not: treat the three-layer contract as a completed, repository-wide architecture.

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
- Decision: A progression renders as plain text, and text parses back into chord identity + timing semantics per the supported grammar.
- Reason: Human-readable, searchable, shareable shorthand.
- Evidence: `src/domain/progressionText.ts`, `src/domain/textProgression.ts`, `src/domain/textScoreTokenizer.ts`.
- Consequences: Text entry and formatting are deterministic and tested.
- Do not: treat text as an exact MIDI round-trip — it does not guarantee pitch voicing, octave, doubling, hand allocation, or exact note timing / articulation.

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

## ADR-008 — Union-chimera partition is default ON (Family B fix)

- ID: ADR-008
- Title: `enableUnionChimeraPartition` default ON, `false` = exact-legacy rollback
- Status: CONFIRMED (P5.37)
- Decision: The union-chimera partition (frozen policy v1, `minBucketPcs = 3`) is the
  product default. Omitting the flag or `true` applies the promoted fix; only the
  literal `false` restores exact legacy. The flag is retained (not deleted).
- Reason: Family B (fixed 2-beat evidence mixing → wrong-root/broad-slash chimera) is
  a CONFIRMED cause of LF-MIDI-001; the fix corrects the known targets and 4 further
  SUPPORTED-LIKELY-CORRECTION windows with 0 SUSPICIOUS, and Loop Vault prioritizes
  harmonic accuracy + reduced human-correction effort over a small analysis-time
  increase. Absolute overhead ~+20 ms (≈13→33 ms) is imperceptible for one-shot
  import, so performance is informational, not a default-ON blocker.
- Evidence: `src/domain/midi/unionChimera.ts`, `src/domain/midi/legacy.ts`
  (`partitionUnionChimeras` in `analyzeMidiWithRankingScores`); `docs/phase5.37/`
  (`reports/P5.37-06-closeout.md`). Test-locked: `analyzeMidi(x)` ==
  `analyzeMidi(x, {enableUnionChimeraPartition: true})`; `{false}` == legacy baseline.
- Consequences: The default MIDI timeline now partitions confirmed chimera windows.
  Coherent windows are unchanged; source notes/meter/vocabulary/scorer are unchanged.
  Rollback stays trivial via the flag.
- Do not: delete the flag; change frozen policy v1 (trigger/threshold/scorer/
  heuristic) without a new authorized stage; claim this Family B policy itself
  fixes Family A or representability. Family A is fixed independently by P5.38;
  Family C remains open. A future performance optimization (reuse main-loop
  ranking) must not change policy v1.

## ADR-009 — Presentation grouping is default ON (Family A fix)

- ID: ADR-009
- Title: `enablePresentationGrouping` default ON, `false` = exact-legacy presentation
- Status: CONFIRMED (P5.38)
- Decision: Omitting `enablePresentationGrouping` or setting it to `true` applies
  the promoted `p538-presentation-grouping-shadow-v2` runtime projection after
  the resolved `fullTimeline`; only literal `false` restores exact-legacy
  downstream presentation. The flag is retained.
- Reason: Source-meter bars and presentation spans are different concepts.
  Reusing truthful 1/4 source bars for formatted progression and cards caused
  downstream fragmentation; rewriting meter would corrupt source truth.
- Evidence: `src/domain/midi/presentationGrouping.ts`,
  `src/domain/midi/analysis.ts`, `src/views/CaptureView.tsx`, and
  `docs/phase5.38/reports/P5.38-05-closeout.md`.
- Consequences: formatted progression, candidate-card summaries, and visible
  card topology/count use variable-duration PresentationGroups. Source meter,
  `totalBars`, timeline bar/beat, persistence/export, `SongMiniMap`, and
  `ProgressionGrid` remain source truth. No projection/policy is persisted;
  schema, `fileVersion`, and migrations are unchanged.
- Do not: treat a PresentationGroup as a source bar or rewritten meter bar;
  persist the projection; delete the rollback flag; change frozen v2 policy
  without new authorization; claim this fixes Family C representability.

## ADR-007 — Source Bassline is a selected-bass contract

- ID: ADR-007
- Title: Source Bassline exact-beat capture (selected bass voice only)
- Status: CONFIRMED
- Decision: A selected bass voice is captured as `SourceBasslineSnapshotV1` with exact beats, velocity, and captured harmony spans; identity and raw ticks stay transient.
- Reason: Preserve a selected bass voice as source truth rather than re-deriving it from analysis.
- Evidence: `src/domain/sourceBassline/types.ts`, `src/domain/sourceBassline/snapshot.ts`.
- Consequences: It is a bass-specific contract, not a general polyphonic Source Truth container.
- Do not: extend source bassline to all polyphonic voices without a separate decision.
