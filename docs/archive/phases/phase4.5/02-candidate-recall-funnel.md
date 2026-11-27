# Phase 4.5-02 D2 Candidate Recall Funnel

Dev 40 MIDI / 320 events. Canonical identity is used at every stage.

| Metric | Result | Frozen gate |
|---|---:|---:|
| rawCandidateRecall | 78.7500% | >= 90% |
| canonicalCandidateRecall | 78.7500% | >= 90% |
| eligibleCandidateRecall | 78.7500% | >= 90% |
| sameRootCandidateRecall | 78.7500% | >= 90% |
| sameRoot Gold Top-1 | 62.1875% | diagnostic |
| sameRoot Gold Top-2 | 72.5000% | diagnostic |
| sameRoot Gold Top-3 | 75.0000% | diagnostic |
| sameRoot Gold mean rank | 1.373016 | <= 3 |
| global Gold mean rank | 1.968254 | diagnostic |
| displayed Top-3 canonical | 70.6250% | baseline |

## First drop stage

- raw-generation: 68
- canonical-dedup: 0
- eligibility: 0
- same-root-pool: 0
- same-root-rank: 0
- global-rank: 0
- allocated-top3: 26

## Decision input

The raw, canonical, eligible and same-root recalls are evaluated against the preregistered 90% gate. A failed upstream recall gate prevents allocation promotion even when a same-root oracle can improve displayed Top-3. Detailed miss rows, ranks and drop reasons are in the JSON artifact.
