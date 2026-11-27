# Phase 4.4 Validation Freeze

P4.4-05で固定した設定を専用Validationへ一度だけ適用した。結果確認後の閾値変更は禁止。

## 固定設定

```json
{
  "minimumRoleConfidence": 0.65,
  "minimumConcurrentNonMelodyPitches": 4,
  "minimumConcurrentSupportBeats": 0.2
}
```

| 専用Validation | Product | Shadow | Delta |
|---|---:|---:|---:|
| Contamination events | 6 | 6 | 0 |
| Melody leak | 2.54% | 2.54% | 0.00% |
| Exact | 62.50% | 62.50% | 0.00% |
| Precision | 96.74% | 96.74% | 0.00% |
| Recall | 79.46% | 79.46% | 0.00% |
| F1 | 87.25% | 87.25% | 0.00% |
| Usable | 25.00% | 39.58% | 14.58% |
| Bass | 100.00% | 100.00% | 0.00% |
| Top | 87.50% | 87.50% | 0.00% |
| Register | 87.50% | 87.50% | 0.00% |

- contamination reduction: 0.00%
- new major failures: 0
- dedicated holdout: blocked-not-evaluated

## Gate

- contaminationReductionAtLeastQuarter: false
- melodyLeakImproves: false
- exactSignMatchesDev: false
- usableSignMatchesDev: true
- recallRegressionWithinHalfPoint: true
- bassNonRegression: true
- topRegressionWithinHalfPoint: true
- registerRegressionWithinHalfPoint: true
- noNewMajorFailure: true
- sourceNoteAdditionsZero: true
- generalF1RegressionWithinQuarterPoint: true

- overall: FAIL
- chord label / Timeline: 製品経路未接続のため不変
