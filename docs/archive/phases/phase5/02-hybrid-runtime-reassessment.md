# Phase 5 Hybrid Runtime Reassessment

## Decision

- Hybrid for Accuracy First: **NOT ADOPTED**
- Stable analyzer: `phase4-v1`
- Accuracy First analyzer: `phase4-v1`
- Candidate Union without Hybrid: **CONTINUE**
- Reason: Typical runtime was measured independently, but Hybrid did not reduce correction cost across the evaluated corpora.

296秒のEndlessだけを停止根拠にはしていない。150〜220秒を「約3分」として、
synthetic 180秒、利用可能な実MIDIを別々に測定した。相対runtimeはGateにしていない。

## Typical MIDI

- samples: 17
- median: 7125.4ms
- p95: 9480.6ms
- max: 9480.6ms
- 10 seconds hard stop: PASS

## Runtime / Memory

| Fixture | Duration | Mode | Median ms | P95 ms | Max ms | Peak observed RSS MB | Deterministic |
|---|---:|---|---:|---:|---:|---:|---|
| synthetic-180s | 179.9s | phase4-v1 | 79.5 | 105.6 | 105.6 | 875.9 | PASS |
| synthetic-180s | 179.9s | hybrid-v1 | 1907.6 | 2310.3 | 2310.3 | 952.4 | PASS |
| all-instruments | 206.4s | phase4-v1 | 155.4 | 164.1 | 164.1 | 957.9 | PASS |
| all-instruments | 206.4s | hybrid-v1 | 8502.8 | 9480.6 | 9480.6 | 1145.4 | PASS |
| suran-remix | 206.4s | phase4-v1 | 80.3 | 92.9 | 92.9 | 1144.1 | PASS |
| suran-remix | 206.4s | hybrid-v1 | 7137.1 | 7249.1 | 7249.1 | 1144.2 | PASS |
| endless-reference | 295.0s | phase4-v1 | 111.1 | 112.4 | 112.4 | 1144.5 | PASS |
| endless-reference | 295.0s | hybrid-v1 | 13500.3 | 13588.8 | 13588.8 | 1169.0 | PASS |

`mainThreadBlockedP95Ms`は各P95と同値である。現在のProduct解析は同期処理であり、
Captureは解析前に進捗表示を描画するが、解析中に入力イベントは処理できない。
Hybridを採用しない判断はruntime単独ではなく、下記の修正コスト比較による。

## Accuracy / Correction Cost

| Corpus | Phase4 exact | Hybrid exact | Phase4 recall | Hybrid recall | Phase4 cost | Hybrid cost |
|---|---:|---:|---:|---:|---:|---:|
| chord-drip-100 | 0.2788 | 0.2609 | 0.4471 | 0.3875 | 1.5983 | 1.6834 |
| chapter3-seed-100 | 0.9774 | 0.9649 | 0.9900 | 0.9875 | 0.0401 | 0.0526 |
| phase4.5-label-dev | 0.6094 | 0.6281 | 0.7312 | 0.7375 | 0.7688 | 0.7406 |
| phase4.7-gold | 0.0382 | 0.0382 | 0.0451 | 0.0694 | 1.9167 | 1.8889 |

- correction-cost improved corpora: 2
- correction-cost regressed corpora: 2

Hybridは約3分の10秒Gateを独立に評価したが、Phase4よりCorpus横断の修正負担を
下げる条件を満たさない。したがってAnalyzer既定は変更せず、補完性の高い軽量modeを
使うCandidate UnionをHybrid非依存で継続する。
