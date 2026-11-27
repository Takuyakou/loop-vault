# P4.3-05 Voicing Ablation Matrix

dev 40 MIDI / 320 events。全条件でChordSymbolはGoldを使い、境界とroleだけを切替えた。

```text
npm run eval:p43:ablation -- --split dev
```

## Source-faithful

| 条件 | exact | precision | recall | F1 | register exact | usable | fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
| A Gold boundary / Gold role | 86.25% | 97.97% | 96.45% | 97.20% | 91.56% | 81.25% | 18.75% |
| B Gold boundary / Product role | 75.94% | 96.07% | 96.45% | 96.26% | 82.50% | 67.81% | 32.19% |
| C Product boundary / Gold role | 86.88% | 98.31% | 96.57% | 97.43% | 92.19% | 80.94% | 19.06% |
| D Product boundary / Product role | 76.56% | 96.46% | 96.57% | 96.51% | 83.13% | 67.50% | 32.50% |

## 損失分解

| 差分 | exact | F1 | register exact | usable | fallback |
|---|---:|---:|---:|---:|---:|
| B - A: role loss | -10.31pt | -0.94pt | -9.06pt | -13.44pt | +13.44pt |
| C - A: boundary loss | +0.63pt | +0.23pt | +0.63pt | -0.31pt | +0.31pt |
| D - A: total | -9.69pt | -0.69pt | -8.44pt | -13.75pt | +13.75pt |

Product boundaryがdevで僅かに良いのは「境界がGoldより正しい」という意味ではない。
現行抽出器にとって偶然有利なspanが選ばれた結果で、boundary由来の損失はこの
Gold corpusでは再現しなかった。

一方、Product roleはextra noteを35から69へ増やし、exactを10.31point、
usableを13.44point下げた。最初の明確な追加損失Stageはrole推定である。

## Structure failure

4条件ともrepresentation accuracy 95%、aggregated-as-simultaneous 100%。
これはrole/boundaryより前の条件Aですでに発生するため、
`representation-type` / `note-selection` failureとしてP4.3-06へ渡す。

## Validation

このStageではdevのみ。failure taxonomyの分類規則をP4.3-06で固定した後、
validation 10 MIDIを一度だけ実行する。

集計JSON: `docs/phase4.3/05-voicing-ablation-dev.json`

event別詳細: `.local-evaluation/phase4.3/ablation-dev-events.json`
