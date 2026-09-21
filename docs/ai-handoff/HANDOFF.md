# Loop Vault — Handoff (Navigation / Situation Summary)

When to read:
Read this first, before any other handoff document.

Do not preload:
This is a short navigation summary. Read ARCHITECTURE-MAP / DECISIONS / KNOWN-FAILURES only when your task needs them.

## Last verified against

- commit: 31242c0b39539c8cbeb00f59415bc8fb04bb3d9b
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

- The trunk (master) is well past the V1.1 "Record & Compare" milestone. Phase 5.18.2 (Vault source discoverability) is long since merged.
- The trunk now includes the P5.33 first-wave **Voicing Rules engine** (`src/domain/voicingRules/`), the **Progression Voicing Practice** surface (the Voicing Loop), **Source Bassline** exact capture, and **Text Progression Entry**.
- The default MIDI analyzer is `phase4-v1` (rolled back from `phase4.1-v1`).

## Major systems (see ARCHITECTURE-MAP for paths)

1. Vault (data model + persistence + store)
2. MIDI Import / Capture (+ Source Bassline + Text Progression entry panels)
3. Analyzer (deterministic symbolic chord detection)
4. Voice Roles
5. Voicing Memory / Source Voicing
6. Source Bassline (exact-beat source capture)
7. Text Progression Entry
8. Voicing Rules engine (P5.33 first wave)
9. Progression Voicing Practice (Voicing Loop surface)
10. Practice (Chord Dojo + voicing + transposition + mix)
11. Bass Practice (+ Record & Compare)
12. Live MIDI
13. Progression Advisor (LLM)
14. MIDI Export / native DAW drag
15. Security (intake budgets / CSP)
16. i18n

## Current active concern (USER-REPORTED, cause undetermined)

Clean, structured chord MIDI may be degraded by the analyzer's interpretation
(for example a simple minor-7 shape reported as an unrelated slash chord). This
is recorded as `LF-MIDI-001` in KNOWN-FAILURES.md. The root cause is **not**
confirmed; it is one of several hypotheses. Do not declare 1/4 meter, onset
clustering, or any single factor as the cause.

## Architecture direction (CONFIRMED, still evolving)

The separation is now realized in committed code:

```text
Source Truth  →  Harmony Interpretation  →  Practice Rendering
```

- Source Truth: `src/domain/sourceBassline/` (exact-beat bass capture), `src/domain/voicing/` source voicing, `src/domain/textProgression.ts` (text as source).
- Harmony Interpretation: the analyzer's chord identity (`phase4-v1`) and `src/domain/voicingRules/` (golden corpus + first-wave rules with provenance).
- Practice Rendering: `src/domain/progressionVoicingPractice/` (clock, library, voicing resolution), bass practice.

## Protected contracts

Repository safety rules: see root `AGENTS.md` (canonical; do not duplicate here).

Product-level invariants to never break without explicit authorization:

- Vault schema / `fileVersion` must not change.
- Source MIDI exactness: source voicing / source bassline are not quantized / retimed / transposed / rewritten.
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
