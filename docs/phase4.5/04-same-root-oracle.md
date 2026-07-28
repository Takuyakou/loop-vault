# Phase 4.5-04 D4 Same-root Oracle

Oracle A keeps the current rank 1 byte-for-byte and replaces slots 2-3 with the highest raw-score canonical identities from rank 1's root pool. Gold labels are used only for evaluation.

| Metric | Current | Oracle | Delta |
|---|---:|---:|---:|
| Top-3 canonical | 70.6250% | 73.1250% | +2.5000pp |
| Top-3 root | 98.1250% | 94.6875% | -3.4375pp |
| MRR | 0.657813 | 0.666146 | +0.008333 |
| correction mean | 0.768750 | 0.768750 | +0.000000 |
| manual input | 12.5000% | 12.5000% | +0.0000pp |

- gained canonical rescue: 8
- lost root rescue: 11
- net rescue: -3
- lost-root / gained ratio: 1.375000
- rank 1 changes: 0

## Frozen gate

- oracleGainMinimum: 0.03
- oracleGainPass: false
- netRescuePass: false
- lostRootRatioMaximum: 0.25
- lostRootRatioPass: false
- correctionMeanPass: false
- manualInputPass: true
- rank1InvariantPass: true

Oracle B was not executed: D3 did not establish one allocation-editable family that warrants a Gold-independent family-specific oracle.
