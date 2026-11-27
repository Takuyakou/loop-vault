# Phase 3.6.1 MIDI Ablation Report

Each row disables exactly one hybrid feature. Deltas are relative to `all-on`.

| Variant | Root | Root delta | Quality | Quality delta | Top-3 | Top-3 delta | Boundary F1 | Corrections | Correction delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| all-on | 53.88% | +0.00pp | 55.33% | +0.00pp | 20.10% | +0.00pp | 69.72% | 915 | +0 |
| without-trackRoleEstimation | 54.96% | +1.08pp | 54.47% | -0.86pp | 19.34% | -0.75pp | 70.43% | 920 | +5 |
| without-ornamentSuppression | 53.39% | -0.48pp | 54.36% | -0.97pp | 19.56% | -0.54pp | 69.59% | 918 | +3 |
| without-adaptiveSegmentation | 53.99% | +0.11pp | 55.33% | +0.00pp | 20.10% | +0.00pp | 69.68% | 915 | +0 |
| without-keyPrior | 53.56% | -0.32pp | 55.55% | +0.22pp | 20.42% | +0.32pp | 69.08% | 913 | -2 |
| without-twoPassDecoding | 53.88% | +0.00pp | 55.33% | +0.00pp | 20.10% | +0.00pp | 69.72% | 915 | +0 |
| without-adjacentMerge | 53.45% | -0.43pp | 54.36% | -0.97pp | 20.47% | +0.38pp | 45.35% | 916 | +1 |

## Interpretation

- Positive accuracy deltas after disabling a feature indicate that the feature currently hurts this corpus.
- Negative correction deltas are improvements.
- This evaluates raw hybrid output on the synthetic corpus; product output still keeps legacy primary chords.
