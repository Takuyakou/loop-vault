# Phase 3.6.5 Stage B2 Correction Cost Evaluation

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
- Guard failure: required dirty category did not improve: drums
- Guard failure: required dirty metric did not improve: drums Root@3
- Guard failure: required dirty metric did not improve: drums Exact@1
- Guard failure: required dirty cost did not decrease: drums correction proxy/case
- Guard failure: required dirty category did not improve: type0
- Guard failure: required dirty metric did not improve: type0 Root@3
- Guard failure: required dirty metric did not improve: type0 Exact@1
- Guard failure: required dirty cost did not decrease: type0 correction proxy/case
- Default analyzer: legacy (unchanged)
- Clean cases: 100
- Dirty cases: 1100
- Evaluation subset: all case(s) per category
- Clean guard: PASS
- Determinism: PASS (26 cases)
- Real MIDI Gold: not-evaluable (0 cases)
- Total runtime: 45.6 s

## Accuracy and legacy delta

Category | Analyzer | Guard | Cases | Root@1 | Delta | Root@3 | Delta | Quality@1 | Delta | Quality@3 | Delta | Exact@1 | Delta | Exact@3 | Delta
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
clean | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
clean | legacy-boundary-rerank | reference | 100 | 57.97% | +0.22pp | 62.61% | -2.16pp | 61.48% | +0.65pp | 77.10% | +2.32pp | 13.79% | +0.11pp | 21.12% | +1.45pp
clean | voice-aware-rerank-v1 | pass | 100 | 58.19% | +0.43pp | 62.82% | -1.94pp | 61.37% | +0.54pp | 76.78% | +1.99pp | 13.69% | +0.00pp | 21.23% | +1.56pp
type0 | legacy | reference | 100 | 57.70% | +0.00pp | 65.57% | +0.00pp | 60.61% | +0.00pp | 75.38% | +0.00pp | 13.58% | +0.00pp | 19.83% | +0.00pp
type0 | legacy-boundary-rerank | reference | 100 | 58.24% | +0.54pp | 62.72% | -2.86pp | 60.83% | +0.22pp | 76.83% | +1.45pp | 13.58% | +0.00pp | 20.80% | +0.97pp
type0 | voice-aware-rerank-v1 | mixed | 100 | 58.14% | +0.43pp | 62.98% | -2.59pp | 61.15% | +0.54pp | 76.83% | +1.45pp | 13.58% | +0.00pp | 21.12% | +1.29pp
drums | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
drums | legacy-boundary-rerank | reference | 100 | 57.97% | +0.22pp | 62.61% | -2.16pp | 61.48% | +0.65pp | 77.10% | +2.32pp | 13.79% | +0.11pp | 21.12% | +1.45pp
drums | voice-aware-rerank-v1 | mixed | 100 | 58.19% | +0.43pp | 62.82% | -1.94pp | 61.37% | +0.54pp | 76.78% | +1.99pp | 13.69% | +0.00pp | 21.23% | +1.56pp
melody | legacy | reference | 100 | 58.08% | +0.00pp | 65.30% | +0.00pp | 57.38% | +0.00pp | 73.60% | +0.00pp | 9.91% | +0.00pp | 19.23% | +0.00pp
melody | legacy-boundary-rerank | reference | 100 | 58.08% | +0.00pp | 62.66% | -2.64pp | 57.49% | +0.11pp | 69.67% | -3.93pp | 10.02% | +0.11pp | 19.61% | +0.38pp
melody | voice-aware-rerank-v1 | mixed | 100 | 58.08% | +0.00pp | 62.98% | -2.32pp | 57.38% | +0.00pp | 70.15% | -3.45pp | 10.02% | +0.11pp | 19.99% | +0.75pp
metadata-missing | legacy | reference | 300 | 57.69% | +0.00pp | 64.71% | +0.00pp | 60.85% | +0.00pp | 74.80% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
metadata-missing | legacy-boundary-rerank | reference | 300 | 58.01% | +0.32pp | 62.59% | -2.12pp | 61.39% | +0.54pp | 77.10% | +2.30pp | 13.76% | +0.07pp | 21.05% | +1.38pp
metadata-missing | voice-aware-rerank-v1 | mixed | 300 | 58.12% | +0.43pp | 62.77% | -1.94pp | 61.39% | +0.54pp | 76.78% | +1.98pp | 13.69% | +0.00pp | 21.23% | +1.56pp
sustain | legacy | reference | 100 | 57.76% | +0.00pp | 64.76% | +0.00pp | 60.83% | +0.00pp | 74.78% | +0.00pp | 13.69% | +0.00pp | 19.67% | +0.00pp
sustain | legacy-boundary-rerank | reference | 100 | 57.00% | -0.75pp | 62.12% | -2.64pp | 60.29% | -0.54pp | 80.23% | +5.44pp | 13.69% | +0.00pp | 15.19% | -4.47pp
sustain | voice-aware-rerank-v1 | mixed | 100 | 56.68% | -1.08pp | 62.28% | -2.48pp | 59.91% | -0.92pp | 80.33% | +5.55pp | 13.74% | +0.05pp | 15.84% | -3.83pp
jitter | legacy | reference | 100 | 57.92% | +0.00pp | 64.60% | +0.00pp | 61.05% | +0.00pp | 75.32% | +0.00pp | 13.20% | +0.00pp | 19.94% | +0.00pp
jitter | legacy-boundary-rerank | reference | 100 | 57.92% | +0.00pp | 62.28% | -2.32pp | 60.94% | -0.11pp | 76.45% | +1.13pp | 13.15% | -0.05pp | 19.99% | +0.05pp
jitter | voice-aware-rerank-v1 | mixed | 100 | 57.92% | +0.00pp | 62.45% | -2.16pp | 60.94% | -0.11pp | 76.83% | +1.51pp | 13.15% | -0.05pp | 20.10% | +0.16pp
same-channel-mixed | legacy | reference | 200 | 47.60% | +0.00pp | 55.90% | +0.00pp | 51.35% | +0.00pp | 72.04% | +0.00pp | 7.65% | +0.00pp | 12.96% | +0.00pp
same-channel-mixed | legacy-boundary-rerank | reference | 200 | 47.63% | +0.03pp | 55.52% | -0.38pp | 51.02% | -0.32pp | 69.02% | -3.02pp | 7.65% | +0.00pp | 12.82% | -0.13pp
same-channel-mixed | voice-aware-rerank-v1 | mixed | 200 | 47.90% | +0.30pp | 57.87% | +1.97pp | 51.16% | -0.19pp | 71.04% | -1.00pp | 7.68% | +0.03pp | 15.65% | +2.69pp
combined | legacy | reference | 100 | 52.37% | +0.00pp | 63.25% | +0.00pp | 55.44% | +0.00pp | 77.86% | +0.00pp | 7.54% | +0.00pp | 15.79% | +0.00pp
combined | legacy-boundary-rerank | reference | 100 | 52.26% | -0.11pp | 59.16% | -4.09pp | 55.55% | +0.11pp | 77.26% | -0.59pp | 7.54% | +0.00pp | 9.38% | -6.41pp
combined | voice-aware-rerank-v1 | regressed | 100 | 52.37% | +0.00pp | 58.35% | -4.90pp | 55.44% | +0.00pp | 75.48% | -2.37pp | 7.54% | +0.00pp | 8.89% | -6.90pp

## Boundary, correction, and runtime

Category | Analyzer | Guard | Correction/case | Delta | Boundary P | Delta | Boundary R | Delta | Legacy boundary identical | Primary changes | Runtime ms
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---:
clean | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 796.5
clean | legacy-boundary-rerank | reference | 9.1700 | -0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 30 | 1825.4
clean | voice-aware-rerank-v1 | pass | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1636.4
type0 | legacy | reference | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 833.4
type0 | legacy-boundary-rerank | reference | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 24 | 1457.6
type0 | voice-aware-rerank-v1 | mixed | 9.1900 | +0.0000 | 76.99% | +0.00pp | 90.09% | +0.00pp | yes | 54 | 1597.3
drums | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 729.8
drums | legacy-boundary-rerank | reference | 9.1700 | -0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 30 | 1467.4
drums | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1342.9
melody | legacy | reference | 9.5500 | +0.0000 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 0 | 694.6
melody | legacy-boundary-rerank | reference | 9.5400 | -0.0100 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 16 | 1568.9
melody | voice-aware-rerank-v1 | mixed | 9.5400 | -0.0100 | 65.94% | +0.00pp | 96.27% | +0.00pp | yes | 60 | 1627.2
metadata-missing | legacy | reference | 9.1800 | +0.0000 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 0 | 2115.2
metadata-missing | legacy-boundary-rerank | reference | 9.1733 | -0.0067 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 88 | 4567.0
metadata-missing | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.54% | +0.00pp | 90.05% | +0.00pp | yes | 167 | 4628.8
sustain | legacy | reference | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 0 | 818.9
sustain | legacy-boundary-rerank | reference | 9.1900 | +0.0100 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 53 | 1371.6
sustain | voice-aware-rerank-v1 | mixed | 9.1800 | +0.0000 | 76.55% | +0.00pp | 90.09% | +0.00pp | yes | 56 | 1489.2
jitter | legacy | reference | 9.2200 | +0.0000 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 0 | 694.8
jitter | legacy-boundary-rerank | reference | 9.2300 | +0.0100 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 32 | 1361.8
jitter | voice-aware-rerank-v1 | mixed | 9.2300 | +0.0100 | 74.14% | +0.00pp | 93.02% | +0.00pp | yes | 59 | 1526.2
same-channel-mixed | legacy | reference | 9.7900 | +0.0000 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 0 | 1354.4
same-channel-mixed | legacy-boundary-rerank | reference | 9.7900 | +0.0000 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 51 | 2655.2
same-channel-mixed | voice-aware-rerank-v1 | mixed | 9.7850 | -0.0050 | 67.79% | +0.00pp | 86.88% | +0.00pp | yes | 73 | 2921.1
combined | legacy | reference | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 0 | 605.5
combined | legacy-boundary-rerank | reference | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 2 | 1559.1
combined | voice-aware-rerank-v1 | regressed | 9.8000 | +0.0000 | 59.06% | +0.00pp | 95.41% | +0.00pp | yes | 4 | 1687.2

## Candidate diversity

Category | Analyzer | Candidate coverage | Duplicate-root ratio | Manual input proxy/case | Avg displayed candidates | Exact @3-@1
--- | --- | ---: | ---: | ---: | ---: | ---:
clean | legacy | 19.67% | 75.59% | 8.5700 | 3.00 | +5.98pp
clean | legacy-boundary-rerank | 23.65% | 73.42% | 8.2000 | 5.00 | +7.33pp
clean | voice-aware-rerank-v1 | 23.76% | 74.61% | 8.1900 | 5.00 | +7.54pp
type0 | legacy | 19.83% | 74.22% | 8.5400 | 3.00 | +6.25pp
type0 | legacy-boundary-rerank | 23.28% | 75.33% | 8.2400 | 5.00 | +7.22pp
type0 | voice-aware-rerank-v1 | 23.76% | 74.47% | 8.1900 | 5.00 | +7.54pp
drums | legacy | 19.67% | 75.59% | 8.5700 | 3.00 | +5.98pp
drums | legacy-boundary-rerank | 23.65% | 73.42% | 8.2000 | 5.00 | +7.33pp
drums | voice-aware-rerank-v1 | 23.76% | 74.61% | 8.1900 | 5.00 | +7.54pp
melody | legacy | 19.23% | 73.83% | 8.6000 | 3.00 | +9.32pp
melody | legacy-boundary-rerank | 21.12% | 72.28% | 8.4100 | 5.00 | +9.59pp
melody | voice-aware-rerank-v1 | 21.34% | 74.29% | 8.3900 | 5.00 | +9.97pp
metadata-missing | legacy | 19.67% | 75.71% | 8.5700 | 3.00 | +5.98pp
metadata-missing | legacy-boundary-rerank | 23.62% | 73.59% | 8.2033 | 5.00 | +7.29pp
metadata-missing | voice-aware-rerank-v1 | 23.76% | 74.56% | 8.1900 | 5.00 | +7.54pp
sustain | legacy | 19.67% | 75.59% | 8.5700 | 3.00 | +5.98pp
sustain | legacy-boundary-rerank | 15.79% | 70.06% | 8.9800 | 5.00 | +1.51pp
sustain | voice-aware-rerank-v1 | 16.27% | 72.66% | 8.9400 | 5.00 | +2.10pp
jitter | legacy | 19.94% | 77.97% | 8.5400 | 3.00 | +6.73pp
jitter | legacy-boundary-rerank | 22.90% | 72.58% | 8.2700 | 5.00 | +6.84pp
jitter | voice-aware-rerank-v1 | 22.95% | 73.75% | 8.2600 | 5.00 | +6.95pp
same-channel-mixed | legacy | 12.96% | 72.70% | 9.2550 | 3.00 | +5.31pp
same-channel-mixed | legacy-boundary-rerank | 13.95% | 70.78% | 9.1550 | 5.00 | +5.17pp
same-channel-mixed | voice-aware-rerank-v1 | 17.30% | 72.09% | 8.8350 | 5.00 | +7.97pp
combined | legacy | 15.79% | 65.87% | 8.9400 | 3.00 | +8.24pp
combined | legacy-boundary-rerank | 10.45% | 71.11% | 9.5100 | 5.00 | +1.83pp
combined | voice-aware-rerank-v1 | 9.70% | 73.90% | 9.5900 | 5.00 | +1.35pp

## Operation correction cost (Stage B2)

Category | Analyzer | Segments | Total | Mean | Median | P90 | Cost 0 | Cost 1 | Cost 2 | Cost 3 | Cost 4
--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
clean | legacy | 1058 | 2905 | 2.7457 | 4.00 | 4.00 | 164 | 67 | 177 | 116 | 534
clean | legacy-boundary-rerank | 1058 | 2865 | 2.7079 | 4.00 | 4.00 | 165 | 105 | 138 | 116 | 534
clean | voice-aware-rerank-v1 | 1058 | 2863 | 2.7060 | 4.00 | 4.00 | 165 | 107 | 136 | 116 | 534
type0 | legacy | 1058 | 2903 | 2.7439 | 4.00 | 4.00 | 164 | 69 | 175 | 116 | 534
type0 | legacy-boundary-rerank | 1058 | 2869 | 2.7117 | 4.00 | 4.00 | 165 | 101 | 142 | 116 | 534
type0 | voice-aware-rerank-v1 | 1058 | 2863 | 2.7060 | 4.00 | 4.00 | 165 | 107 | 136 | 116 | 534
drums | legacy | 1058 | 2905 | 2.7457 | 4.00 | 4.00 | 164 | 67 | 177 | 116 | 534
drums | legacy-boundary-rerank | 1058 | 2865 | 2.7079 | 4.00 | 4.00 | 165 | 105 | 138 | 116 | 534
drums | voice-aware-rerank-v1 | 1058 | 2863 | 2.7060 | 4.00 | 4.00 | 165 | 107 | 136 | 116 | 534
melody | legacy | 1058 | 2941 | 2.7798 | 4.00 | 4.00 | 128 | 103 | 177 | 116 | 534
melody | legacy-boundary-rerank | 1058 | 2920 | 2.7599 | 4.00 | 4.00 | 129 | 122 | 157 | 116 | 534
melody | voice-aware-rerank-v1 | 1058 | 2918 | 2.7580 | 4.00 | 4.00 | 129 | 124 | 155 | 116 | 534
metadata-missing | legacy | 3174 | 8716 | 2.7461 | 4.00 | 4.00 | 492 | 200 | 532 | 348 | 1602
metadata-missing | legacy-boundary-rerank | 3174 | 8597 | 2.7086 | 4.00 | 4.00 | 494 | 315 | 415 | 348 | 1602
metadata-missing | voice-aware-rerank-v1 | 3174 | 8589 | 2.7060 | 4.00 | 4.00 | 495 | 321 | 408 | 348 | 1602
sustain | legacy | 1058 | 2905 | 2.7457 | 4.00 | 4.00 | 164 | 67 | 177 | 116 | 534
sustain | legacy-boundary-rerank | 1058 | 2948 | 2.7864 | 4.00 | 4.00 | 164 | 24 | 220 | 116 | 534
sustain | voice-aware-rerank-v1 | 1058 | 2948 | 2.7864 | 4.00 | 4.00 | 164 | 24 | 220 | 116 | 534
jitter | legacy | 1058 | 2905 | 2.7457 | 4.00 | 4.00 | 161 | 73 | 174 | 116 | 534
jitter | legacy-boundary-rerank | 1058 | 2878 | 2.7202 | 4.00 | 4.00 | 160 | 102 | 146 | 116 | 534
jitter | voice-aware-rerank-v1 | 1058 | 2876 | 2.7183 | 4.00 | 4.00 | 160 | 104 | 144 | 116 | 534
same-channel-mixed | legacy | 2116 | 6129 | 2.8965 | 4.00 | 4.00 | 178 | 115 | 523 | 232 | 1068
same-channel-mixed | legacy-boundary-rerank | 2116 | 6101 | 2.8833 | 4.00 | 4.00 | 178 | 143 | 495 | 232 | 1068
same-channel-mixed | voice-aware-rerank-v1 | 2116 | 6022 | 2.8459 | 4.00 | 4.00 | 179 | 220 | 417 | 232 | 1068
combined | legacy | 1058 | 3006 | 2.8412 | 4.00 | 4.00 | 101 | 92 | 215 | 116 | 534
combined | legacy-boundary-rerank | 1058 | 3065 | 2.8970 | 4.00 | 4.00 | 101 | 33 | 274 | 116 | 534
combined | voice-aware-rerank-v1 | 1058 | 3075 | 2.9064 | 4.00 | 4.00 | 101 | 23 | 284 | 116 | 534

## Dirty status

- type0: mixed
- drums: mixed
- melody: mixed
- metadata-missing: mixed
- sustain: mixed
- jitter: mixed
- same-channel-mixed: mixed
- combined: regressed

Correction proxy remains the existing wrong-primary-segment proxy. Operation correction cost is reported separately and does not change the old field.
