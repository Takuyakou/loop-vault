# Phase 4.5-06 Decision Lock

## Decision

**B. Candidate Generationへ仕切り直し**

Allocation Shadowには進まない。Phase 4.5は診断完了として閉じ、候補生成を別Phaseで扱う。

## D1-D5 evidence

| Condition | Value | Frozen gate | Result |
|---|---:|---:|---|
| rank3Contribution | 0.000000 | <= 0.01 | PASS |
| rawCandidateRecall | 0.787500 | >= 0.90 | FAIL |
| canonicalCandidateRecall | 0.787500 | >= 0.90 | FAIL |
| eligibleCandidateRecall | 0.787500 | >= 0.90 | FAIL |
| sameRootCandidateRecall | 0.787500 | >= 0.90 | FAIL |
| sameRootMeanRank | 1.373016 | <= 3 | PASS |
| allocationEditableShare | 0.276596 | >= 0.50 | FAIL |
| ambiguousOrAnnotationShare | 0.000000 | <= 0.20 | PASS |
| oracleGain | 0.025000 | >= 0.03 | FAIL |
| netRescue | -3.000000 | > 0 | FAIL |
| lostRootToGainedRatio | 1.375000 | <= 0.25 | FAIL |
| correctionCostMeanDelta | 0.000000 | < 0 | FAIL |
| manualInputRequiredDelta | 0.000000 | <= 0 | PASS |
| highConfidenceBandExists | false | true | FAIL |
| rank1ChangeCount | 0.000000 | = 0 | PASS |

## Why B

- raw / canonical / eligible / same-root candidate recallはすべて78.75%で、90% Gate未達。
- Top-3 missのうちallocation編集可能なのは26/94件（27.66%）で、50% Gate未達。
- Same-root Oracleは+2.5ppに留まり、root rescueを11件失い、net rescueは-3件。
- 全Gateを満たすhigh-confidence root帯は存在しない。
- ambiguous / annotation issueは0件のため、根拠不足による研究停止Cではなく、候補生成不足Bと判断する。

## Stop conditions applied

- P4.5-07 Allocation Shadow: 未実行
- P4.5-08 Dev / LOSO: 未実行
- P4.5-09 Validation: 未実行
- P4.5-10 Holdout: 未実行
- Product rank 2-3 allocation: 未変更

rank 1、Analyzer、Timeline、voicing、boundary、aggregate/fallback、schema、fileVersionは変更していない。
