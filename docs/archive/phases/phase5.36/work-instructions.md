# P5.36 Work Instructions

## Scope

Diagnostic / causal validation of the current-attack / meter mechanism: attack
provenance instrumentation, meter-normalized chord-identity A/B, beat/sub-window
shadow isolation + wrong-root/slash score decomposition, and an exact P5.37
target. Authorized surfaces: `docs/phase5.36/**`, `scripts/p536/**`, test/shadow
pure helpers, deterministic fixtures, ignored local `LF-MIDI-001` evaluation,
privacy-safe reports (Contract 01). Detailed rules below.

## Non-goals

Production 1/4→4/4 rewrite, production meter normalization, production sub-window
segmentation, ranking/scoring changes, candidate-generation changes, vocabulary
expansion, carryover-attenuation promotion, Preserve-first/sourcePerformance
persistence, UI/Vault schema changes. No merge/push/tag/release. No P5.37 package.

## Definition of Done

The current-attack/meter mechanism is `CONFIRMED` or `REJECTED` on privacy-safe
evidence (synthetic + `LF-MIDI-001`), with a bounded exact P5.37 target if
confirmed, production/runtime diff = 0 throughout, and all gates (synthetic,
corpus, official clean analyzer scope, determinism, privacy) green. Final outcome
is one of the three START-HERE strings; then STOP.

## 1. Quality priority

Causal correctness > speed. Do not rush to P5.37 with an attractive but uncontrolled explanation.

## 2. Git safety

Before every stage inspect status/branch/HEAD/log. Never reset/stash/discard user work, never `git add -A` or `git add .`, explicit-path staging only, no automatic merge/push/tag/release.

## 3. Evidence classes

Use: `CONFIRMED`, `SUPPORTED-HYPOTHESIS`, `REJECTED-HYPOTHESIS`, `UNRESOLVED`, `USER-REPORTED`, `HISTORICAL`, `CONFLICT`.

## 4. Critical rule

Do not treat:

```text
attack occurs inside 2-beat window
```

as proof that:

```text
attack belongs to same harmonic state as every other attack in that window
```

## 5. Production unchanged

Authorized: docs, scripts, test/shadow helpers, deterministic fixtures, ignored local evaluation, privacy-safe reports. Production behavior remains unchanged.

## 6. Same-source A/B invariants

When comparing original vs diagnostic meter-normalized views, keep pitch/start/duration/velocity/PPQ/tempo/source ordering/analyzer mode/options identical. Only diagnostic meter/grid view may differ.

## 7. Attack provenance

Every attacked contribution should be attributable, where available, to:
- absolute beat;
- relative beat in legacy 2-beat window;
- beat/sub-window bucket;
- voice/role;
- structural bass flag;
- pitch class;
- deterministic attack cluster;
- overlap duration;
- neighboring bucket occupancy.

Private reports must aggregate/anonymize.

## 8. Candidate diagnostics

For correct and wrong-root candidates report support by bucket, structural bass, defining tones, broad-template extra tones, current score components, slash/root compatibility, and rank. Do not modify scoring.

## 9. Meter normalization is diagnostic only

Do not implement global suspicious-meter correction.

## 10. Sub-window isolation is shadow only

Beat-sized or attack-group-sized views are diagnostics, not production segmentation.

## 11. Private fixture

Use only `LF-MIDI-001`; never track filename/path/raw MIDI/full note list/audio/checksum/`.local-evaluation`.

## 12. Test scope

Use the current official clean repository test scope. Do not reuse scratch-inflated historical counts as current truth.

## 13. Stage closeout

status/diff → focused tests → diff-check → explicit staging → staged review → commit → report/state → validators → no-new-untracked check.
