# Phase 4.7-05 dev Results

## 結論

- Gate: FAIL
- Corpus: `loop-vault-bass-companion-identity-gold-v1`
- Events / applicable: 96 / 45
- Product接続: なし
- Stop condition: Dev Gate FAILのためValidation / Holdoutを実行せず、Productへ接続しない。

## Invariants

- rank 1 unchanged: 96/96
- candidate set retained: 96/96
- existing score/order retained: 96/96
- duplicate / missing provenance: 0/0
- inertness: 100.0000%

## Efficacy

| Metric | Before | Shadow |
|---|---:|---:|
| Candidate recall | 56.2500% | 61.4583% |
| Top-3 canonical | 5.2083% | 5.2083% |
| Top-3 root | 17.7083% | 17.7083% |
| MRR | 0.053904 | 0.054110 |
| Correction cost mean | 1.906250 | 1.906250 |
| Correction cost p90 | 2 | 2 |
| Manual input | 0.0000% | 0.0000% |

- candidate rescue / loss: 5/0
- baseline canonical/root Top-3 retained: 5/5, 17/17
- new canonical/root miss: 0/0
- added: 45 (0.468750/event, max 1)

## Family

| Family | Events | Applicable | Candidate gain | Candidate loss | Top-3 canonical loss |
|---|---:|---:|---:|---:|---:|
| 13 | 14 | 8 | 1 | 0 | 0 |
| 7sus4 | 14 | 9 | 1 | 0 | 0 |
| dom7 | 13 | 8 | 1 | 0 | 0 |
| m7 | 14 | 2 | 0 | 0 | 0 |
| m9 | 14 | 5 | 1 | 0 | 0 |
| maj7 | 13 | 7 | 0 | 0 | 0 |
| maj9 | 14 | 6 | 1 | 0 | 0 |

## Bass condition

| Condition | Events | Applicable | Candidate gain | Candidate loss | Top-3 canonical loss |
|---|---:|---:|---:|---:|---:|
| fifth | 12 | 3 | 0 | 0 | 0 |
| long | 53 | 27 | 0 | 0 | 0 |
| medium | 31 | 13 | 4 | 0 | 0 |
| non-chord | 12 | 7 | 0 | 0 | 0 |
| passing | 12 | 7 | 0 | 0 | 0 |
| pedal | 12 | 8 | 1 | 0 | 0 |
| plain-gold | 48 | 26 | 5 | 0 | 0 |
| root | 12 | 2 | 0 | 0 | 0 |
| same-track | 48 | 19 | 0 | 0 | 0 |
| separate-track | 48 | 26 | 5 | 0 | 0 |
| seventh | 12 | 9 | 2 | 0 | 0 |
| short | 24 | 10 | 2 | 0 | 0 |
| slash-gold | 48 | 19 | 0 | 0 | 0 |
| third | 12 | 4 | 1 | 0 | 0 |

## Runtime / Determinism

- baseline / shadow median: 78.950 / 85.797 ms
- overhead: 8.6720%
- deterministic: PASS

## Gates

| Gate | Result |
|---|---|
| applicabilityMinimum | PASS |
| rank1Invariant | PASS |
| candidateSuperset | PASS |
| existingScoreInvariant | PASS |
| existingOrderInvariant | PASS |
| baselineCanonicalTop3Preserved | PASS |
| baselineRootTop3Preserved | PASS |
| newCanonicalMissZero | PASS |
| newRootMissZero | PASS |
| applicableCandidateRecallImproved | PASS |
| applicableTop3CanonicalNonRegressed | PASS |
| applicableTop3RootNonRegressed | PASS |
| generatedRescuePositive | PASS |
| inertness | PASS |
| mrrNonRegressed | PASS |
| correctionCostNonRegressed | PASS |
| manualInputNonRegressed | PASS |
| duplicateZero | PASS |
| provenanceComplete | PASS |
| economy | FAIL |
| runtime | FAIL |
| deterministic | PASS |
| familyMajorRegressionZero | PASS |
| overall | FAIL |
