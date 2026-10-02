# Loop Vault — Handoff (Navigation / Situation Summary)

When to read:
Read this first, before any other handoff document.

Do not preload:
This is a short navigation summary. Read ARCHITECTURE-MAP / DECISIONS / KNOWN-FAILURES only when your task needs them.

## Last verified against

- commit: f7768617f01bf61c342b9cbb991c139681d70a22
- date: 2026-10-02

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
- Keep: save chosen progressions into the Vault (the old pipeline status is kept in data but no longer shown).
- Practice: rehearse degrees, rhythm, bass, and voicings.
- Reuse: search and re-open saved progressions.

## Situation summary (CONFIRMED)

- The trunk (master) includes the P5.33 first-wave **Voicing Rules engine** (`src/domain/voicingRules/`), the **Progression Voicing Practice** surface (the Voicing Loop), **Source Bassline** exact capture, and **Text Progression Entry**.
- The default MIDI analyzer is `phase4-v1` (rolled back from `phase4.1-v1`).
- P5.37 Family B correction and P5.38 Family A presentation grouping are both
  promoted, hardened, and enabled by default with explicit-false exact-legacy
  rollback flags retained.
- Phase 9 Core v2 research is closed on `research/phase9-core-v2` without Product
  promotion or merge. P9.0–P9.5 and P9.MID are complete; P9.6–P9.8 were not run.
  Current Core C remains the Product/rollback baseline. The disposition and
  limitations are in [`FINAL-CLOSEOUT.md`](../phase9/FINAL-CLOSEOUT.md).

## Phase 11 integrated into local master

The human authorized merging `feat/phase11-voicing-loop-v4` (`5359a037`) into local master. Merge/fresh-tested HEAD: `52159ae6`. Fresh FULL: 3,670 Vitest / 177 Playwright PASS, 0 FAIL / 0 UNRUN; cache unused. See [integration report](../phase11.0/reports/P11-master-merge.md).

P11-00–P11-08 preserve session-only native A–B ranges, exact persisted Text preview notes, four explicit voicing sources, visible partial-source fallback, and human manual/live pitches across chord rename. Source MIDI compatibility stays guarded; Vault stays v2. Basic/Core primary types and legacy detailed controls remain. P11-07 Range shortcuts remain; P11-08 details dismissal and compact Next Move are included. The prior candidate/stop-before-merge notes are historical. Runnable EXE from tested P11-08 code remains available; no push/tag/release or new phase in this integration.

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
13. Progression Advisor (LLM) — back end only; the UI was removed in Phase 8.9
14. MIDI Export / native DAW drag
15. Security (intake budgets / CSP)
16. i18n

## Current concern (LF-MIDI-001 — Families A/B fixed; Family C unpromoted)

The original clean-MIDI failure split into independent cause families. Current
product truth is:

- **Family B (wrong-root / broad-slash mislabel) — CONFIRMED + FIXED, DEFAULT ON.**
  P5.37's `enableUnionChimeraPartition` omitted/`true` applies the promoted
  partition before smoothing; `false` is exact legacy.
- **Family A (1/4 meter → downstream presentation fragmentation) — CONFIRMED +
  FIXED, DEFAULT ON.** P5.38's `enablePresentationGrouping` omitted/`true`
  projects the resolved `fullTimeline` through
  `p538-presentation-grouping-shadow-v2`; `false` is exact legacy presentation.
  The projection changes formatted progression, card summaries, and visible
  card topology/count only. Source meter, `totalBars`, timeline bar/beat,
  persisted events/coordinates, export, `SongMiniMap`, and `ProgressionGrid`
  remain source truth.
- **Family C (extended/altered/omission-sensitive vocabulary and
  representability) — P5.39 CLOSED, `PROMOTION = FAIL`, NOT IN PRODUCTION.**
  The frozen Shadow policy passed representability and synthetic ranking but
  failed whole-file safety and Family B interaction (Gates H/J). A necessary
  temporal split survives, yet one reviewed local identity sequence disagrees
  with independent ground truth. See
  [`P5.39-closeout.md`](../phase5.39/P5.39-closeout.md). Further local
  identity/ranking research belongs to a separately authorized phase.

P5.40's final Shadow correction re-evaluation (Stage02b) ended
`SHADOW SAFETY = FAIL`: newly changed unreviewed regions and unresolved
reviewed divergences block Promotion. See the
[`anonymous Stage02b report`](../phase5.40/reports/P5.40-02b-final-shadow-safety.md).
No production Family C integration or Stage03 is authorized.

P5.40 is **CLOSED** with final `SHADOW SAFETY = FAIL` and **no production
Promotion**. The final Stage02c safe-activation attempt generated and
top-ranked both independently established local identities, but activation
scope and temporal arbitration failed whole-file safety. The existing
`phase4-v1` production Core remains active and available for regression and
rollback; normal advanced-analyzer feature expansion on it is frozen, with
critical bugfixes only. The next analyzer direction is a separately authorized
**Analyzer Core v2 architecture redesign**, not another P5.40 patch; Core v2
implementation has not started. See the
[`P5.40 Closeout`](../phase5.40/reports/P5.40-closeout.md).

The architectural ordering is:

```text
source MIDI / meter
→ harmonic analysis
→ P5.37 Family B correction
→ resolved fullTimeline
→ P5.38 presentation projection
→ presentation consumers
```

`PresentationGroup` is a variable-duration harmonic presentation span; it is
neither a source bar nor a rewritten meter bar. Do not claim every MIDI-import
issue is solved: Families A and B are fixed, while Family C remains unpromoted.
Local representability/ranking research succeeded, but safe activation and
temporal arbitration in the current pipeline did not converge.

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

Phase 8.8 adds an explicit Extended Text dialect with source-text provenance,
written attack/hold/rest timing, and Generated Voicing handoff in Vault v2.
It remains separate from MIDI extraction and exact source-note playback. See
[Phase 8.8 handoff](../phase8.8/P8.8-final-handoff.md).

## Phase 8.9 (UI/UX renewal) result

Phase 8.9 rebuilt the shell and design system, Home, Vault and Settings, removed
approved features from the UI (status pipeline, monthly goal, next action, + Idea,
references/assets, History, AI advisor UI), made the display Japanese only, and kept
every stored field (round-trip test `src/domain/p89DataRetention.test.ts`). Chord Dojo,
Bass Practice and the progression page (absorbing the Idea detail) are deferred to
later phases. See the phase final report `docs/phase8.9/reports/P8.9-FINAL.md`.

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

Do not preload all phase docs. Use the standing local merge and EXE
authorization in root `AGENTS.md`; never push automatically.

## P11-09 acceptance candidate complete

Branch `fix/phase11-acceptance-layout-source-hands`, based on local master `8b6480b4`. Scope: current-panel/root geometry, complete exact Saved/Source deduplication, Saved fixed hand assignment and generated-type menu. No master merge/push/tag/release. [Current evidence](../phase11.0/reports/P11-09-acceptance-layout-source-hands.md). P11-00–08 integration above remains historical. Native WebView selector symptom was not reproduced in Chromium; distinguish that limitation from measured fixes.

P11-09 final tested code / EXE HEAD `53682f69`: fresh FULL 3,687 Vitest / 186 Playwright PASS, 0 FAIL / 0 UNRUN, cache unused. Detail-shape → primary-type focus regression was isolated and fixed before this final verification. Result follow-up is documentation-only; local master remains `8b6480b4`. Stop for Human Product Acceptance, no merge/push/tag/release.

## P11-10 current acceptance candidate

Same branch/worktree as P11-09. Unavailable 0/N Source controls are native disabled with on-demand title/accessibility reasons; the old availability info banner is removed. Stale unavailable Source preferences recover through existing complete-source priority, partial AUTO fallback stays unchanged. Generated type/details remain visible but disabled for fixed Saved/Source/Custom. Source changes close details and returning Generated preserves the session's prior family, Basic/Core, left-hand variant, Color/Open.

Final tested code / EXE HEAD `b0fe80769ed907f420d5da244df34e0f0c7dd13d`: fresh FULL 3,694 Vitest / 189 Playwright PASS, 0 FAIL / 0 UNRUN, no PASS cache. First failed FULL and bounded isolation are recorded in [P11-10 report](../phase11.0/reports/P11-10-source-availability-generated-controls.md). Result follow-up is documentation-only. No master merge/push/tag/release; local master remains `8b6480b4`. Stop for Human Product Acceptance.

## P11-09/10 integrated into local master

The human explicitly authorized the merge. Candidate `29918fef` was merged into local master at `f7768617f01bf61c342b9cbb991c139681d70a22`; merge tree equals candidate. Fresh FULL on that merge HEAD: 3,694 Vitest / 189 Playwright PASS, 0 FAIL / 0 UNRUN, no PASS cache. [Integration evidence](../phase11.0/reports/P11-09-10-master-merge.md). Earlier candidate stop-before-merge statements are historical. Result follow-up is documentation-only; tracked state clean, pre-existing untracked reports/assets/Claude outputs untouched. No push/tag/release, new implementation stage or EXE rebuild in this merge task.
