# Loop Vault — Handoff (Navigation / Situation Summary)

When to read:
Read this first, before any other handoff document.

Do not preload:
This is a short navigation summary. Read ARCHITECTURE-MAP / DECISIONS / KNOWN-FAILURES only when your task needs them.

## Last verified against

- commit: e0bef0316e2fa7586e76b625b337a22ff886c030
- date: 2026-09-21

Freshness note: the verified commit is the code/docs state this handoff was
checked against. It is expected to be behind HEAD after later handoff-only
commits; being behind HEAD is not itself stale. Only a missing commit (FAIL) or
a non-ancestor commit (WARN / freshness review) is treated as a freshness
problem by the validator.

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

- The trunk (master) includes the P5.33 first-wave **Voicing Rules engine** (`src/domain/voicingRules/`), the **Progression Voicing Practice** surface (the Voicing Loop), **Source Bassline** exact capture, and **Text Progression Entry**.
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

## Confirmed building blocks

These exist in committed code and are independently verified:

- per-chord `sourceVoicing` (exact pitch/octave snapshot for one chord; no timing).
- selected-bass `SourceBasslineSnapshotV1` (exact-beat start/duration, velocity; 4/4).
- the analyzer's chord identity (segmentation / ranking / confidence).
- Voicing Rules (first wave) and generated practice voicings.
- Progression Voicing Practice rendering (clock, library, voicing resolution).

## Architecture direction (PROPOSED)

The following is a design direction, **not** a completed repository-wide
contract, and it is **not** yet extended to general MIDI import fidelity:

```text
Source Truth  →  Harmony Interpretation  →  Practice Rendering
```

- Source Truth = facts observed/kept directly from a source (`sourceVoicing`, `Source Bassline`).
- Harmony Interpretation = harmonic estimates (the analyzer; chord identity).
- Practice Rendering = practice voicings derived from chord identity / rules.

The presence of the building blocks above does **not** mean the three-layer
contract is fully realized, nor that a general exact full-polyphonic
source-performance snapshot exists.

## Text Progression (separate input contract)

Text Progression parses chord notation into chord identity and timing semantics.
It is **not** an exact MIDI performance representation: it does not recover the
original pitch voicing, octave, doubling, hand allocation, or exact note timing /
articulation.

## Protected contracts

Repository safety rules: see root `AGENTS.md` (canonical; do not duplicate here).

Product-level invariants to never break without explicit authorization:

- Vault schema / `fileVersion` must not change.
- Source exactness is scoped: `sourceVoicing` keeps pitch/octave; `Source Bassline` keeps a selected bass voice. A general full-polyphonic source snapshot is not yet a contract.
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
