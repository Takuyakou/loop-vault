# Codex Handoff — P5.38 (Closed)

## Final product truth

P5.38 is complete:

```text
Family A cause: CONFIRMED
Family A production fix: implemented, promoted, hardened, DEFAULT ON
feature: enablePresentationGrouping
omitted / true: promoted p538-presentation-grouping-shadow-v2
false: exact-legacy downstream presentation

Family B cause: CONFIRMED
Family B production fix: implemented, DEFAULT ON
enableUnionChimeraPartition false: exact-legacy rollback

Family C: OPEN / separate
```

Verify these statements against Git; documents never outrank code/tests.

## Architecture contract

```text
source MIDI / meter
↓
harmonic analysis
↓
P5.37 Family B correction
↓
resolved fullTimeline
↓
P5.38 Family A Presentation Projection
↓
presentation-facing consumers
```

```text
PresentationGroup != source bar
PresentationGroup != rewritten meter bar
```

PresentationGroups are variable-duration, harmonic-event-oriented spans.
Source meter, source bars, timeline coordinates, persistence, and export
provenance remain source truth.

Current presentation consumers are formatted progression presentation,
candidate-card summaries, and visible card topology/count. `SongMiniMap` and
`ProgressionGrid` remain source-bar consumers.

## Historical record

- Shadow v1: `PROMOTION = FAIL`; its frozen 0.5 multi-source-group span-ratio
  condition was too conservative on private Gate A.
- Shadow v2: structural source/event relation plus counterfactual improvement
  guard; not threshold retuning; `PROMOTION = PASS`.
- P5.38-03 production integration → P5.38-04 hardening/default-ON approval →
  P5.38-05 closeout.

## Resume boundary

Do not reopen or retune Family A or Family B without explicit authorization.
Do not delete either rollback flag. Do not treat PresentationGroups as bars.
Family C vocabulary/representability is the next separate open issue, but no
next phase may start automatically.
