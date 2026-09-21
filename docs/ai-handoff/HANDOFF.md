# Loop Vault — Handoff (Navigation / Situation Summary)

When to read:
Read this first, before any other handoff document.

Do not preload:
This is a short navigation summary. Read ARCHITECTURE-MAP / DECISIONS / KNOWN-FAILURES only when your task needs them.

## Last verified against

- commit: 0e27c10e590c57b4dc40e0c375f3c87a15489ba7
- date: 2026-09-21

Refresh this file when:

- major architecture changes
- active product concern changes
- protected contract changes
- major product workflow changes

## Product mission (CONFIRMED)

Loop Vault is a desktop app that helps a producer turn MIDI into a working
progression vocabulary. It is **not** a chord detector.

- Capture: import MIDI, choose which voices to analyze, and get a chord timeline plus candidate blocks.
- Correct: edit candidates and chords (range select, replace, split/merge, move) with Undo/Redo.
- Keep: save chosen progressions into the Vault with pipeline status.
- Practice: rehearse degrees, rhythm, bass, and voicings.
- Reuse: search and re-open saved progressions.

## Situation summary (CONFIRMED)

- Current HEAD documents V1.1 "Record & Compare" (bass practice self-review).
- Phase 5.18.2 (Vault source discoverability) is complete and human-accepted; its master merge is authorized but not yet performed.
- A voicing "rule engine v2" direction (P5.33) exists as research only. It is not in the committed runtime.
- The default MIDI analyzer is `phase4-v1` (rolled back from `phase4.1-v1`).

## Major systems (see ARCHITECTURE-MAP for paths)

1. Vault (data model + persistence + store)
2. MIDI Import / Capture
3. Analyzer (deterministic symbolic chord detection)
4. Voice Roles
5. Voicing Memory / Source Voicing
6. Progression editing / classification
7. Practice (Chord Dojo + voicing practice + transposition + mix)
8. Bass Practice (+ Record & Compare)
9. Live MIDI (real-time chord detection from a physical keyboard)
10. Progression Advisor (LLM)
11. MIDI Export / native DAW drag
12. i18n

## Current active concern (USER-REPORTED, cause undetermined)

Clean, structured chord MIDI may be degraded by the analyzer's interpretation
(for example a simple minor-7 shape reported as an unrelated slash chord). This
is recorded as `LF-MIDI-001` in KNOWN-FAILURES.md. The root cause is **not**
confirmed; it is one of several hypotheses. Do not declare 1/4 meter, onset
clustering, or any single factor as the cause.

## Architecture direction (PROPOSED)

The intended long-term separation is:

```text
Source Truth  →  Harmony Interpretation  →  Practice Rendering
```

- Source Truth: the notes / timing actually present in the source MIDI.
- Harmony Interpretation: the chord identity the analyzer inferred.
- Practice Rendering: practice-specific voicings (Teacher / Core / generated, ...).

Only a seed of this exists today (Voicing Memory's `sourceVoicing` slot). It is
**not** a completed, shipped architecture. Treat it as PROPOSED unless current
Git explicitly proves otherwise.

## Protected contracts

Repository safety rules: see root `AGENTS.md` (canonical; do not duplicate here).

Product-level invariants to never break without explicit authorization:

- Vault schema / `fileVersion` must not change.
- Source MIDI exactness: source voicing is not quantized / retimed / transposed / rewritten.
- Private MIDI / audio / personal paths are never committed.
- Analyzer / MIDI exporter / playback behavior are not changed incidentally.

## How to resume work

1. Inspect Git reality (branch, HEAD, status).
2. Read root `AGENTS.md`.
3. Read this file.
4. Read the active phase README + execution-state (the docs/phase package for that phase).
5. Read only task-relevant contracts/reports.
6. Inspect actual code and tests before editing.

Do not preload all phase docs. Do not merge or push to master without a human.
