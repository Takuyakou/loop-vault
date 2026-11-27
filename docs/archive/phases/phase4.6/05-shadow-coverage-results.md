# Phase 4.6-05 Shadow Coverage Results

Dev 40 MIDI / 320 events. Validation and Holdout were not run.

## Coverage

| Metric | Before | Shadow union |
|---|---:|---:|
| overall canonical candidate recall | 78.7500% | 81.2500% |
| target plain m7 recall | 90.0000% | 100.0000% |
| rescued events | - | 8 |
| still missing | 68 | 60 |

## Candidate economy

- total added: 65
- average / event: 0.203125
- maximum / event: 2
- canonical duplicates: 0
- missing provenance: 0

## Runtime

- baseline median: 154.490 ms
- Shadow median: 160.349 ms
- overhead: 3.7927%
- peak heap delta difference: 2877416 bytes
- deterministic: true

## Product invariants

- rank 1: true
- Top-3: true
- candidate count/order/score: true
- Analyzer output: true

## Gates

- targetFamilyRawRecallAtLeast80: PASS
- targetFamilyCanonicalRecallAtLeast80: PASS
- overallRawRecallImproved: PASS
- canonicalDuplicateZero: PASS
- provenanceMissingZero: PASS
- productInvariant: PASS
- averageAddedAtMost4: PASS
- maximumAddedAtMost12: PASS
- runtimeWithin20Percent: PASS
- deterministicOutput: PASS

Shadow candidates remain evaluation-only and are not written to Product, UI or Vault.
