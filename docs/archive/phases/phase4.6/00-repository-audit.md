# Phase 4.6-00 Repository Audit

## Product candidate generation

- Entry point: `src/domain/midi/analysis.ts::analyzeMidi()`
- Formal mode: `defaultAnalyzerMode = "phase4-v1"` in `src/domain/midi/analysis.ts`
- Phase 4 adapter: `src/domain/midi/phase4Analyzer.ts::analyzeMidiPhase4()`
- Window construction: `src/domain/midi/legacy.ts::buildWeightedWindows()`
- Raw monolithic vocabulary: `src/domain/midi/legacy.ts::templates`
- Raw scoring: `src/domain/midi/legacy.ts::scoreTemplates()`
- Raw ordering: `src/domain/midi/legacy.ts::rankWindowCandidates()`
- Product primary and alternatives: `src/domain/midi/legacy.ts::matchWindowWithRankingScore()`
- Product alternative allocation and canonical dedup: `src/domain/chordAlternatives.ts::selectQuickChordAlternatives()`

The raw vocabulary contains 21 qualities for each of 12 roots, producing 252 raw hypotheses per non-empty window. It does not contain a compositional altered-tension expansion. The primary is the maximum pre-clamp raw score; UI confidence is clamped later.

## Clamp, budget and dedup

- Raw scores are sorted before clamp in `rankWindowCandidates()`.
- Product confidence is clamped in `matchWindowWithRankingScore()`.
- Product alternatives are canonical-deduplicated and capped at five in `selectQuickChordAlternatives()`.
- Displayed Top-3 is primary plus the first two alternatives in the Phase 4.5 evaluator.
- There is no raw root budget before the 252 monolithic hypotheses are scored.
- Block-candidate budget is separate and does not control chord-label hypotheses.

## Canonical mapping

- Symbol construction / serialization: `src/domain/chords.ts::makeChordSymbol()` and `labelFromSymbol()`
- Parsing: `src/domain/chords.ts::parseChordLabel()`
- Canonical identity: `src/domain/chordIdentity.ts::normalizeChordLabel()` and `chordIdentityKey()`
- Product alternative key: `src/domain/chordAlternatives.ts::canonicalChordAlternative()`

Canonical identity includes root, triad, seventh, extensions, alterations and non-root bass. Therefore a generated slash identity such as `Dm7/C` does not satisfy Gold `Dm7`.

## Root and slash source

- Root hypotheses are the 12-root loop inside `scoreTemplates()`.
- Bass pitch class is the maximum `bassHistogram` bin.
- A slash bass is attached when that bass differs from root and is a member of the candidate pitch-class set.
- This automatic slash attachment means root-position and inversion identities are not independently enumerated.

## Phase 4.5 diagnostic surface

`src/domain/midi/legacy.ts::diagnoseLegacyWindowCandidates()` exposes the same pre-clamp raw ordering for evaluation only. It is not exported through the public MIDI index, not called by Product analysis, not serialized and not shown in UI.

## Phase 4.6 isolation

Phase 4.6 Shadow Catalog and Counterfactual Evaluator must live in evaluation-only modules. They may consume raw windows and note provenance, but may not mutate `ChordTimelineItem`, `MidiProgressionAnalysis`, Product alternatives, Vault data or UI state.
