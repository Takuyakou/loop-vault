# Phase 5.23 Work Instructions

## Mission
Full Timelineのcandidate clutterを表示層で整理し、採集開始点とtimeline readingを改善する。候補生成を改善するPhaseではない。

## Scope
Candidate grouping、initial selection/snap、harmonic activityだけを扱う。

## Non-goals
Generation、scoring、boundary、count、diversification、reranking、section detector、Analyzer、schema変更は扱わない。

## Stage00 audit
監査対象: Full Timeline、candidate model/ID/score/range、selection/focus/playback/snap/zoom/scroll、visual baselines。Synthetic baselineはnested、shifted、chain trap、separated、one、zero、145+ bars active/inactiveを含む。

## Locked grouping
- inclusive interval metrics: intersection, union, IoU, overlap coefficient, start/end/center distance
- relation: overlap coefficient ≥ .75 AND proximity minimum ≤ 2 bars
- deterministic anchor order: earlier start → later end → ID
- direct anchor membership only; no transitive expansion
- `flatten(groups)` ID multiset equals input exactly

## Display representative
Longest → higher score → earlier start → earlier end → stable ID.

## Default selected variant
Finite `selectionScore` (fallback to `confidence` when absent/non-finite) → higher `confidence` → earlier start → shorter length → earlier end → stable ID. It is intentionally independent of the representative.

## Variant UI
Exact visible labels: JA `<length>小節 · Bar <start>–<end>`; EN `<length> bars · Bars <start>–<end>`. Exact ARIA: JA `候補グループ <g>、バリアント <v>。<length>小節、Bar <start>–<end>`; EN `Candidate group <g>, variant <v>. <length> bars, Bars <start>–<end>`. Focus/hover/opening does not mutate Capture range; explicit activation does.

## Initial selection
Compute exactly one selected variant per group, compare every group's result with the selected-variant comparator, and use the global winner as the one-time initial full-range Draft. The synthetic Contract 03 fixture must choose `initial-b-8` from `[initial-a, initial-b-8, initial-c]`. Zero candidates keep manual fallback. Existing Draft state is never overwritten.

## Snap
New automatic initial Draft uses bar snap. Current Draft snap is not persisted; preserve active-session choices and existing bar/harmonic/beat cycle.

## Harmonic activity
Use only `fullTimeline` absolute event intervals. Sum clipped overlap beats per bar, divide by meter, clamp [0,1], bucket 0/(0,.25]/(.25,.75]/(.75,1]. Exact lane names: JA `和声活動`; EN `Harmonic activity`. Exact intensity terms: JA `活動なし / 低 / 中 / 高`; EN `inactive / low / medium / high`. Exact segment ARIA: JA `和声活動: Bar <bar>、強度 <term>`; EN `Harmonic activity: Bar <bar>, intensity <term>`. Render a subtle non-interactive strip below candidate bars. No Analyzer/raw MIDI/score/section input.

## Stage01
Candidate Grouping / Variant UI only. Generation/scoring/boundary/count diff must be zero; candidates preserved; deterministic.

## Stage02
Initial Selection / Snap / Harmonic Activity only. Analyzer/generator changes are prohibited.

## Stage03
145+ bars, nested, duplicate lengths, chain trap, long labels, responsive/effective 200%, reduced motion, keyboard, axe, stable screenshots.

## Stage04
Phase docs, lint/typecheck, focused/full Vitest, Capture/Timeline and Analyzer exact regression, full Playwright/visual, Web/Tauri, security/audit, diff/generated/privacy hygiene, human acceptance.

## Gates
Each stage runs and records its own gates on its own commit. Prior-HEAD results are not reused.

## Definition of Done
Stage00 lock、全required gates、独立commit、clean statusが事実として記録され、P5.23-01未着手で停止する。

## Stop conditions
Stop on generation/scoring/boundary/count change, candidate loss, nondeterminism, focus-caused selection mutation, new Analyzer need, unexplained visual diff, or any diversification/reranking/section detector work.

`READY FOR PRODUCT ACCEPTANCE — Timeline Candidate Legibility` is the pre-human release-readiness stop after automated release gates. Human Acceptance is a separate subsequent decision and is never implied by READY. No automatic merge/push/P5.23.1/P5.24.
