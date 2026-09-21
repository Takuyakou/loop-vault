# P5.34 Work Instructions

## Scope

Diagnostic / failure-isolation work only: phase docs, diagnostic scripts,
test/shadow-only pure helpers, deterministic synthetic fixtures, ignored local
private-MIDI evaluation, and reports. No production behavior change.

## Non-goals

No production MIDI import / Analyzer / ranking / boundary / persistence /
schema / `fileVersion` / playback / UI / export changes. No default analyzer
change, no automatic meter repair, no onset threshold promotion, no
Preserve-first / sourcePerformance implementation, no merge/push/tag/release.

## Priority
Correct causal isolation > speed. A slower diagnostic is preferable to a fast patch that overfits one MIDI.

## Git
Before each stage inspect status/branch/HEAD/graph. Git is truth.
Never reset/stash/discard user work. Never `git add -A` or `git add .`.
Explicit-path staging only. No merge/push/tag/release.

## Evidence states
Use:
- CONFIRMED
- USER-REPORTED
- SUPPORTED-HYPOTHESIS
- REJECTED-HYPOTHESIS
- UNRESOLVED
- HISTORICAL
- CONFLICT

One real fixture improving is not enough to claim a globally safe cause/fix.

## Private MIDI
Use only `LF-MIDI-001`. Never commit filename/path/bytes/raw full-note dump/audio/checksum/`.local-evaluation`.
Local runner may accept a path via CLI/env/ignored registry and emit privacy-safe aggregates only.

## Source immutability
A/B/C/D must start from the same parsed source-note data.
All transformations are transient diagnostic views. Never rewrite the MIDI file.
Assert source note topology is unchanged across variants: pitch/onset/duration/velocity/event semantics.

## A/B/C/D
### A
Original metadata + current production behavior.

### B
Same musical events; only the diagnostic meter view changes to 4/4.
Do not call B a fix.

### C
Meter-independent segmentation shadow. Meter may exist as metadata but cannot create a harmony boundary by itself.
No production connection.

### D
C plus a bounded PPQ-normalized onset sweep.
For PPQ `P`, try deterministically rounded/deduplicated:
`0, P/96, P/48, P/24, P/16, P/8`.
For PPQ96 ≈ `0,1,2,4,6,12` ticks.
These are experiment points, not production thresholds.

## Metrics
Segmentation:
- total cells/states
- non-empty states
- empty/rest-only cells
- boundary count/positions
- same-harmony fragmentation where ground truth exists
- false merges on hard negatives
- A↔B meter sensitivity
- C/D delta

Identity:
- canonical root
- canonical quality
- slash-bass consistency
- characteristic-tone contradictions
- existing canonical pitch-class explanation/coverage
- surface spelling difference vs semantic difference

Do not count enharmonic spelling alone as semantic failure.
Reuse existing canonicalization/representability utilities where possible.

Execution:
- determinism
- source immutability
- bounded runtime/operations if relevant

## Existing P5.24/P5.26
Audit whether the relevant path actually fires:
- path entered?
- fallback reason?
- local/global rhythm decision?
- passing-bass/restrike handling?
- unsupported identity fallback?

Do not say "P5.26 already solved it" just because the feature exists.

## Separate segmentation from identity
After stable windows exist, rerun isolated semantic fixtures.
If Bm7/B11/etc. still fail, classify separately from meter/onset.

## No production promotion
P5.34 ends with evidence + next-phase proposal only.
No automatic meter repair, onset threshold, persistence change, ranking promotion, tentative-label UI, or Preserve-first implementation.

## Testing
Automate:
- harness unit tests
- synthetic fixtures
- determinism
- source immutability
- meter counterfactual
- onset sweep
- re-strike
- hard-negative false merges
- identity fixtures
- relevant existing analyzer/corpus regressions

Human effort should be limited to final review of evidence.

## Definition of Done

P5.34 ends when the causes of LF-MIDI-001 are isolated and a next-phase
implementation plan exists, backed by evidence (A/B/C/D plus synthetic fixtures),
with private MIDI details absent from Git. See `acceptance/P5.34-acceptance-checklist.md`.

## Closeout
Every stage: status → diff → focused tests → `git diff --check` → explicit staging → cached diff → commit → report/state → validators → clean/new-untracked check.
