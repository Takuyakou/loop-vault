# Phase 3.6.1 Legacy-Boundary Reranker Report

## Method

1. Keep every legacy segment start, end, and duration unchanged.
2. Build weighted pitch profiles only inside each legacy segment.
3. Score hybrid Top-8 candidates without adaptive segmentation or temporal decoding.
4. Score the legacy chord with the same score components and always retain it in the candidate set.
5. Replace legacy only when all conservative evidence thresholds pass.

Default replacement thresholds:

- Score lead: 0.60 or greater
- Core coverage: 0.62 or greater
- Root evidence: 0.08 or greater
- Foreign-note penalty: 0.14 or less
- Missing-core penalty: 0.17 or less

The key prior is not used for replacement scoring. The Phase 3.6.1 ablation showed that disabling it improved Top-3 by 0.32 percentage points and reduced corrections by two on this corpus.

## Synthetic Corpus Result

100 Chord Drip cases, 1058 expected segments:

| Metric | Legacy | Legacy-boundary reranker | Delta |
|---|---:|---:|---:|
| Root accuracy | 57.76% | 57.97% | +0.21pp |
| Quality accuracy | 60.83% | 61.48% | +0.65pp |
| Tetrad accuracy | 38.31% | 39.06% | +0.75pp |
| Exact accuracy | 13.69% | 13.79% | +0.10pp |
| Top-3 accuracy | 19.67% | 21.55% | +1.89pp |
| Boundary precision | 76.55% | 76.55% | 0.00pp |
| Boundary recall | 90.09% | 90.09% | 0.00pp |
| Correction cost | 918 | 917 | -1 |

## Product Decision

The reranker exceeds legacy on this synthetic set without changing boundaries. However, the application default remains `legacy`. The mode is exposed as `legacy-boundary-rerank` for evaluation until real-MIDI results are measured separately.
