# P4.3-04 Oracle-boundary Voicing Baseline

条件A:

```text
Boundary: Gold
Role: Gold（評価ハーネス内のみ）
Split: dev
40 MIDI / 320 events
```

実行:

```text
npm run eval:p43:voicing -- --split dev
```

## 3 Gold Policy

| 指標 | Source-faithful | Aggregate-harmony | Dojo-integrated |
|---|---:|---:|---:|
| exact | 86.25% | 84.38% | 86.25% |
| precision | 97.97% | 98.20% | 97.97% |
| recall | 96.45% | 96.13% | 96.45% |
| F1 | 97.20% | 97.15% | 97.20% |
| extra / missing | 35 / 62 | 31 / 68 | 35 / 62 |
| bass accuracy | 100.00% | 100.00% | 100.00% |
| top accuracy | 91.56% | 90.00% | 91.56% |
| register exact | 91.56% | 90.00% | 91.56% |
| representation accuracy | 95.00% | 95.00% | 95.00% |
| source usable | 81.25% | 81.25% | 81.25% |
| generated fallback | 18.75% | 18.75% | 18.75% |
| requires review | 18.75% | 18.75% | 18.75% |
| stale after edit | 100.00% | 100.00% | 100.00% |

Source-faithfulとDojo-integratedがdevで同値なのは、このsplitのGold配置が同一だった
ためであり、2 policyを統合したという意味ではない。評価列は独立している。

## Representation

- simultaneous/hybrid Goldに対するsimultaneous miss: 0%
- aggregated Goldをsimultaneousと判定: 100%
- aggregated eventのSource-faithful F1: 50.84%

現行抽出器は「simultaneous candidateが1件でもあればaggregateを試さない」ため、
devの最大の明確な構造的問題はaggregated representationの誤分類である。

## Contamination

Source-faithful:

- distractor leak: 2.02%
- melody leak: 2.60%
- passing-tone leak: 0%
- sustain carry: devに明示Gold opportunityなし
- voice duplicate: devに明示Gold opportunityなし

`null`は0%ではなく、当該splitに分母となる明示distractor kindが無いことを表す。

## Clean / Stress

Source-faithful:

| 指標 | clean | stress |
|---|---:|---:|
| exact | 93.75% | 78.75% |
| precision | 99.76% | 96.23% |
| recall | 96.57% | 96.34% |
| F1 | 98.14% | 96.28% |
| source usable | 90.63% | 71.88% |
| fallback | 9.38% | 28.13% |

stressではrecallよりprecisionとfallbackが悪化している。余計なnoteの混入と
review判定が主な差である。

## 解釈

Oracle AでもSource-faithful exactは100%ではないため、境界・製品role以前に
note-selection / representation policyの損失がある。P4.3-05でProduct roleと
Product boundaryを分離し、最初に失われるStageを確定する。

集計JSON: `docs/phase4.3/04-oracle-voicing-dev.json`

event別詳細はignore領域:
`.local-evaluation/phase4.3/oracle-dev-events.json`
