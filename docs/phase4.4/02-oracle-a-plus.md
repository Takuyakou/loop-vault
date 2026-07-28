# Phase 4.4 Oracle A+

A+はGold voicingを返さない。Gold per-note roleでsource noteを選別し、その後は現行の
simultaneous / aggregate / register / compatibility / usable経路を使用した。

## 事前閾値

- A+ Exact gain >= 5pt、またはUsable gain >= 5pt: event-local note filteringを優先
- 閾値はA+結果を見る前に`00-gates.json`で固定済み

| Split / Condition | Exact | Precision | Recall | F1 | Melody leak | Usable |
|---|---:|---:|---:|---:|---:|---:|
| dev A | 88.13% | 97.68% | 100.00% | 98.83% | 2.97% | 100.00% |
| dev A+ | 100.00% | 100.00% | 100.00% | 100.00% | 0.00% | 100.00% |
| dev B | 87.50% | 97.56% | 100.00% | 98.77% | 3.13% | 85.00% |
| validation A | 62.50% | 97.79% | 79.02% | 87.41% | 1.69% | 47.92% |
| validation A+ | 66.67% | 100.00% | 78.57% | 88.00% | 0.00% | 62.50% |
| validation B | 62.50% | 96.74% | 79.46% | 87.25% | 2.54% | 25.00% |

## 差分

| Split | A+−A Exact | A+−A Usable | A+−A Melody leak | B−A Exact | B−A Usable |
|---|---:|---:|---:|---:|---:|
| dev | 11.88pt | 0.00pt | -2.97pt | -0.63pt | -15.00pt |
| validation | 4.17pt | 14.58pt | -1.69pt | 0.00pt | -22.92pt |

## 判断Signal

`event-local-note-filtering`

このStageは理論上限の測定だけであり、製品コードは変更していない。専用holdoutは
not-evaluated。
