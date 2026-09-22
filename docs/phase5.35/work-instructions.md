# P5.35 Work Instructions

## Scope

Shadow-only temporal harmonic-evidence modeling + carryover-resistant candidate
ranking (Contract 01). Diagnostic scripts, shadow pure helpers, deterministic
fixtures, ignored private-MIDI aggregates, and reports. No production top-1 change
before P5.35-04. Detailed boundaries below.

## Non-goals

Meter/bar/text fragmentation fix, 1/4→4/4 rewrite, vocabulary/representability
redesign (S02/S04), Preserve-first / sourcePerformance persistence, confidence UI,
broad Analyzer replacement, and any global penalty of 9/11/13/altered/slash/
broader chords (see "Complexity safety"). No merge/push/tag/release.

## Definition of Done

Causes from P5.34's second family are addressed by a shadow temporal-evidence
model + carryover-resistant ranking that passes the Contract 04 promotion gates
(A–J) with zero legitimate-harmony regression and determinism. Production
integration happens only on `PROMOTION = PASS` plus explicit authorization
(P5.35-04); otherwise the phase records evidence + `PROMOTION = FAIL` and stops.
Private MIDI details are absent from Git.

## Quality priority

Correct musical evidence > implementation speed.

A slower diagnostic is preferred over a ranking patch that damages legitimate harmony.

## Git safety

Before every stage inspect branch/HEAD/status/log.

Never reset/stash/discard user work.
Never `git add -A` or `git add .`.
Explicit-path staging only.
No automatic merge/push/tag/release.

## Protected boundaries

Do not change unless a later stage explicitly authorizes it:

- raw source MIDI;
- Source Voicing exactness;
- Source Bassline exactness;
- Vault schema/fileVersion;
- MIDI export;
- playback;
- Voicing Rules / Voicing Loop;
- Text Progression;
- meter/bar fragmentation behavior;
- chord vocabulary.

## Evidence model, not age penalty

Forbidden shortcut:

```text
note is old
→ reduce weight
```

Required concept:

```text
note contribution
+ temporal position
+ attack/release relation
+ neighboring-window evidence
+ bass role
+ common-tone continuity
+ harmonic-state support
→ evidence role / confidence
```

## Suggested evidence roles

- CURRENT_ATTACK
- CURRENT_SUSTAIN
- COMMON_TONE
- CARRIED_IN_SUSTAIN
- STRUCTURAL_BASS
- SHORT_TRANSIENT
- UNCERTAIN

Implementation names may differ.

Do not infer `current` solely from onset inside a window.
Do not infer `carryover` solely from onset before a window.

## Sustained-harmony hard negative

A held chord with no repeated attack must remain valid harmonic evidence.

## Common-tone safety

A shared pitch across adjacent harmonies must not be automatically classified as contamination.

## Structural bass

P5.34 suggests the bass estimate may be correct while root identity is wrong.
Do not fix bass detection unless evidence shows the bass estimate itself is wrong.

## Complexity safety

Do not globally penalize:

- 9 / 11 / 13;
- altered tensions;
- slash chords;
- chords with more pitch classes.

Broadness itself is not a defect.

## Shadow-first

P5.35-01 and P5.35-02 must not change production top-1.

Shadow diagnostics must record legacy vs shadow result, evidence-role assignments, rank/score deltas, and reason codes.

## Bounded deterministic algorithms

No unbounded search.
Prefer bounded per-window work.
Measure operation count/stress if materially increased.

## Private fixture

Use anonymous ID `LF-MIDI-001` only.
Never track filename/path/raw notes/audio/checksum/`.local-evaluation`.

## Promotion

Do not promote because one private fixture improves.

Promotion requires:
- private contextual failure improvement;
- corrected P5.34 corpus safety;
- held/legato/common-tone safety;
- current analyzer regression safety;
- determinism;
- bounded cost.

## Production integration if eventually authorized

Must be isolated and reversible.
Initial OFF path must equal exact legacy behavior.
Do not change `defaultAnalyzerMode`.

## Stage closeout

At every stage: status/diff → focused tests → diff-check → explicit staging → staged review → commit → report/state → validators → clean/no-new-untracked check.
