# Phase 4.4 Dev Results

事前登録した12設定を専用devだけで比較した。validation / holdoutは参照していない。

## 固定設定

```json
{
  "minimumRoleConfidence": 0.65,
  "minimumConcurrentNonMelodyPitches": 4,
  "minimumConcurrentSupportBeats": 0.2
}
```

| 専用dev | Product | Shadow | Delta |
|---|---:|---:|---:|
| Contamination events | 20 | 3 | -17 |
| Melody leak | 3.13% | 0.47% | -2.66% |
| Exact | 87.50% | 98.13% | 10.63% |
| Precision | 97.56% | 99.63% | 2.07% |
| Recall | 100.00% | 100.00% | 0.00% |
| F1 | 98.77% | 99.81% | 1.05% |
| Usable | 85.00% | 90.63% | 5.63% |
| Bass | 100.00% | 100.00% | 0.00% |
| Top | 88.13% | 98.75% | 10.63% |
| Register | 88.13% | 98.75% | 10.63% |

- contamination reduction: 85.00%
- melody leak improvement: 85.00%

## 既存60 MIDI dev

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
| F1 | 96.26% | 97.01% | 0.75% |
| Plain block Exact | 93.75% | 93.75% | 0.00% |
| Rootless Exact | 93.75% | 93.75% | 0.00% |
| Arpeggio Exact | 37.50% | 37.50% | 0.00% |

## Gate

- dedicated gates: PASS
- general F1 regression <= 0.25pt: true
- plain block non-regression: true
- sourceにないnote追加0: true
- overall: PASS
- chord label / Timeline: 製品経路未接続のため不変
- 専用holdout: not-evaluated

この結果で設定をfreezeする。validation後の変更は禁止。
