# Phase 4.7 Frozen Baseline

BaselineはPhase 4.6で固定した`phase4-v1` Dev 40 MIDI / 320 eventを継承する。

| Metric | Value |
|---|---:|
| raw candidate recall | 78.7500% |
| canonical candidate recall | 78.7500% |
| eligible candidate recall | 78.7500% |
| same-root candidate recall | 78.7500% |
| displayed Top-3 canonical | 70.6250% |
| counterfactual ranking Top-3 canonical | 73.1250% |
| Top-3 root | 95.9375% |
| MRR | 0.675005 |
| correction cost mean | 0.768750 |
| correction cost median | 0 |
| correction cost p90 | 3 |
| manual input required | 12.5000% |
| canonical duplicate | 0 |
| Product candidate count | 1,920 (6/event) |
| runtime | 300.1925 ms |
| runtime/event | 0.938102 ms |
| peak heap delta | 41,885,088 bytes |

Frozen hashes:

- rank 1: `a4166c993a81e4573072eeb05b8db088a56f5ab0d6db15db748fa5fed4b76d63`
- Product Top-3: `fd30ae6acf63c9e04dbc1810e0097949584ecbbdc6b15cbf8242a38b944209fc`
- Product candidates + scores: `11007e43ea40c2b08dbbf1ff03d3f0497ce73c32edbce6f80329233472e49b45`
- Analyzer output: `c841bf9fc416a13ad7dec935fb8bd740d347a7920dec580684b0c06d073951d7`

Top-3 canonicalの2値は測定境界が異なる。70.625%はPhase 4.5 allocation後の
displayed Top-3、73.125%はPhase 4.6 counterfactual用pre-clamp rankingである。
以後は同一境界同士だけを比較する。

