# Phase 3.6.5 Stage A4 Voice-Aware Evaluation

- Status: failed-strict-guard
- Overall guard: FAILED
- Strict exit: enabled
- Guard failure: dirty category regressed: combined (regressed)
- Guard failure: dirty category regressed: drums (mixed)
- Guard failure: dirty category regressed: jitter (mixed)
- Guard failure: dirty category regressed: melody (mixed)
- Guard failure: dirty category regressed: metadata-missing (mixed)
- Guard failure: dirty category regressed: same-channel-mixed (mixed)
- Guard failure: dirty category regressed: sustain (mixed)
- Guard failure: dirty category regressed: type0 (mixed)
- Guard failure: dirty improvement requirement not met
- Default analyzer: legacy (unchanged)
- Clean cases: 100
- Dirty cases: 1100
- Evaluation subset: all case(s) per category
- Clean guard: PASS
- Determinism: PASS (26 cases)
- Real MIDI Gold: not-evaluable (0 cases)
- Total runtime: 46.3 s

## Accuracy and legacy delta

Category | Analyzer | Guard | Cases | Root@1 | Δ | Root@3 | Δ | Quality@1 | Δ | Quality@3 | Δ | Exact@1 | Δ | Exact@3 | Δ
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
clean | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
clean | legacy-boundary-rerank | reference | 100 | 57.97% | +0.22pp | 63.31% | -1.45pp | 61.48% | +0.65pp | 76.62% | +1.83pp | 13.79% | +0.11pp | 21.55% | +1.89pp
clean | voice-aware-rerank-v1 | pass | 100 | 58.19% | +0.43pp | 63.52% | -1.24pp | 61.37% | +0.54pp | 76.67% | +1.89pp | 13.69% | +0.00pp | 21.55% | +1.89pp
type0 | legacy | reference | 100 | 57.70% | +0.00pp | 65.57% | +0.00pp | 60.61% | +0.00pp | 75.38% | +0.00pp | 13.58% | +0.00pp | 19.83% | +0.00pp
type0 | legacy-boundary-rerank | reference | 100 | 58.24% | +0.54pp | 63.04% | -2.53pp | 60.83% | +0.22pp | 76.29% | +0.92pp | 13.58% | +0.00pp | 21.61% | +1.78pp
type0 | voice-aware-rerank-v1 | mixed | 100 | 58.14% | +0.43pp | 63.69% | -1.89pp | 61.15% | +0.54pp | 76.56% | +1.19pp | 13.58% | +0.00pp | 21.55% | +1.72pp
drums | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
drums | legacy-boundary-rerank | reference | 100 | 57.97% | +0.22pp | 63.31% | -1.45pp | 61.48% | +0.65pp | 76.62% | +1.83pp | 13.79% | +0.11pp | 21.55% | +1.89pp
drums | voice-aware-rerank-v1 | mixed | 100 | 58.19% | +0.43pp | 63.52% | -1.24pp | 61.37% | +0.54pp | 76.67% | +1.89pp | 13.69% | +0.00pp | 21.55% | +1.89pp
melody | legacy | reference | 100 | 58.08% | +0.00pp | 65.30% | +0.00pp | 57.38% | +0.00pp | 73.60% | +0.00pp | 9.91% | +0.00pp | 19.23% | +0.00pp
melody | legacy-boundary-rerank | reference | 100 | 58.08% | +0.00pp | 63.58% | -1.72pp | 57.49% | +0.11pp | 69.88% | -3.72pp | 10.02% | +0.11pp | 19.67% | +0.43pp
melody | voice-aware-rerank-v1 | mixed | 100 | 58.08% | +0.00pp | 63.79% | -1.51pp | 57.38% | +0.00pp | 70.04% | -3.56pp | 10.02% | +0.11pp | 19.72% | +0.48pp
metadata-missing | legacy | reference | 300 | 57.69% | +0.00pp | 64.71% | +0.00pp | 60.85% | +0.00pp | 74.80% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
metadata-missing | legacy-boundary-rerank | reference | 300 | 58.01% | +0.32pp | 63.33% | -1.38pp | 61.39% | +0.54pp | 76.67% | +1.87pp | 13.76% | +0.07pp | 21.53% | +1.87pp
metadata-missing | voice-aware-rerank-v1 | mixed | 300 | 58.12% | +0.43pp | 63.51% | -1.20pp | 61.39% | +0.54pp | 76.69% | +1.89pp | 13.69% | +0.00pp | 21.59% | +1.92pp
sustain | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
sustain | legacy-boundary-rerank | reference | 100 | 57.00% | -0.75pp | 62.88% | -1.89pp | 60.29% | -0.54pp | 80.33% | +5.55pp | 13.69% | +0.00pp | 15.41% | -4.26pp
sustain | voice-aware-rerank-v1 | mixed | 100 | 56.68% | -1.08pp | 63.74% | -1.02pp | 59.91% | -0.92pp | 81.52% | +6.73pp | 13.74% | +0.05pp | 15.89% | -3.77pp
jitter | legacy | reference | 100 | 57.92% | +0.00pp | 64.60% | +0.00pp | 61.05% | +0.00pp | 75.32% | +0.00pp | 13.20% | +0.00pp | 19.94% | +0.00pp
jitter | legacy-boundary-rerank | reference | 100 | 57.92% | +0.00pp | 63.42% | -1.19pp | 60.94% | -0.11pp | 76.02% | +0.70pp | 13.15% | -0.05pp | 21.12% | +1.19pp
jitter | voice-aware-rerank-v1 | mixed | 100 | 57.92% | +0.00pp | 63.36% | -1.24pp | 60.94% | -0.11pp | 75.86% | +0.54pp | 13.15% | -0.05pp | 21.23% | +1.29pp
same-channel-mixed | legacy | reference | 200 | 47.60% | +0.00pp | 55.90% | +0.00pp | 51.35% | +0.00pp | 72.04% | +0.00pp | 7.65% | +0.00pp | 12.96% | +0.00pp
same-channel-mixed | legacy-boundary-rerank | reference | 200 | 47.63% | +0.03pp | 55.12% | -0.78pp | 51.02% | -0.32pp | 67.86% | -4.18pp | 7.65% | +0.00pp | 12.77% | -0.19pp
same-channel-mixed | voice-aware-rerank-v1 | mixed | 200 | 47.90% | +0.30pp | 57.73% | +1.83pp | 51.16% | -0.19pp | 70.56% | -1.48pp | 7.68% | +0.03pp | 15.68% | +2.72pp
combined | legacy | reference | 100 | 52.37% | +0.00pp | 63.25% | +0.00pp | 55.44% | +0.00pp | 77.86% | +0.00pp | 7.54% | +0.00pp | 15.79% | +0.00pp
combined | legacy-boundary-rerank | reference | 100 | 52.26% | -0.11pp | 59.70% | -3.56pp | 55.55% | +0.11pp | 76.89% | -0.97pp | 7.54% | +0.00pp | 9.27% | -6.52pp
combined | voice-aware-rerank-v1 | regressed | 100 | 52.37% | +0.00pp | 58.84% | -4.42pp | 55.44% | +0.00pp | 75.97% | -1.89pp | 7.54% | +0.00pp | 8.89% | -6.90pp

## Boundary, correction, and runtime

Category | Analyzer | Guard | Correction/case | Δ | Boundary P | Δ | Boundary R | Δ | Legacy boundary identical | Primary changes | Runtime ms
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---:
clean | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 760.9
clean | legacy-boundary-rerank | reference | 9.1700 | -0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 30 | 1592.6
clean | voice-aware-rerank-v1 | pass | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1278.3
type0 | legacy | reference | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 685.1
type0 | legacy-boundary-rerank | reference | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 24 | 1266.3
type0 | voice-aware-rerank-v1 | mixed | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 54 | 1346.8
drums | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 764.3
drums | legacy-boundary-rerank | reference | 9.1700 | -0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 30 | 1577.2
drums | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1571.6
melody | legacy | reference | 9.5500 | +0.0000 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 0 | 676.6
melody | legacy-boundary-rerank | reference | 9.5400 | -0.0100 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 16 | 1582.6
melody | voice-aware-rerank-v1 | mixed | 9.5400 | -0.0100 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 60 | 1921.4
metadata-missing | legacy | reference | 9.1800 | +0.0000 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 0 | 2598.3
metadata-missing | legacy-boundary-rerank | reference | 9.1733 | -0.0067 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 88 | 5053.5
metadata-missing | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 167 | 4938.3
sustain | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 723.6
sustain | legacy-boundary-rerank | reference | 9.1900 | +0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 53 | 1364.0
sustain | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1425.6
jitter | legacy | reference | 9.2200 | +0.0000 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 0 | 724.9
jitter | legacy-boundary-rerank | reference | 9.2300 | +0.0100 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 32 | 1517.0
jitter | voice-aware-rerank-v1 | mixed | 9.2300 | +0.0100 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 59 | 1601.5
same-channel-mixed | legacy | reference | 9.7900 | +0.0000 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 0 | 1419.6
same-channel-mixed | legacy-boundary-rerank | reference | 9.7900 | +0.0000 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 51 | 2714.6
same-channel-mixed | voice-aware-rerank-v1 | mixed | 9.7850 | -0.0050 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 73 | 2833.9
combined | legacy | reference | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 0 | 644.2
combined | legacy-boundary-rerank | reference | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 2 | 1484.4
combined | voice-aware-rerank-v1 | regressed | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 4 | 1575.8

## Dirty status

- type0: mixed
- drums: mixed
- melody: mixed
- metadata-missing: mixed
- sustain: mixed
- jitter: mixed
- same-channel-mixed: mixed
- combined: regressed

Correction proxy is the existing wrong-primary-segment proxy, not Stage B2 operation cost.
