<!-- phase-id: 5.35 -->

# Phase 5.35 — Context-Aware Harmonic Evidence / Carryover-Resistant Ranking

## Status

- **Status:** in-progress
- **Active stage:** P5.35-02 (shadow carryover-resistant ranking)
- **Completed stages:** P5.35-00 (audit / baseline / contract lock), P5.35-01 (shadow temporal-evidence classifier — [`reports/P5.35-01-shadow-temporal-evidence.md`](reports/P5.35-01-shadow-temporal-evidence.md))
- **Promotion:** NOT_EVALUATED · production integration NOT authorized (Contracts 04/06)
- **Depends on:** P5.34 closeout `5fa26e0` (PASS — FAILURE ISOLATION COMPLETE), in ancestry
- **Baseline / seam:** [`reports/P5.35-00-audit-baseline.md`](reports/P5.35-00-audit-baseline.md)

## Required Reading Order

1. Root `AGENTS.md`, root `CLAUDE.md`
2. [`00-START-HERE.md`](00-START-HERE.md)
3. [`work-instructions.md`](work-instructions.md)
4. [`execution-state.json`](execution-state.json)
5. [`contracts/01-scope-and-protected-surfaces.md`](contracts/01-scope-and-protected-surfaces.md)
6. [`contracts/02-temporal-evidence-model.md`](contracts/02-temporal-evidence-model.md)
7. [`contracts/03-shadow-scoring.md`](contracts/03-shadow-scoring.md)
8. [`contracts/04-promotion-gates.md`](contracts/04-promotion-gates.md)
9. [`contracts/05-private-evidence-and-privacy.md`](contracts/05-private-evidence-and-privacy.md)
10. [`contracts/06-production-integration-if-promoted.md`](contracts/06-production-integration-if-promoted.md)
11. [`reports/P5.35-00-audit-baseline.md`](reports/P5.35-00-audit-baseline.md)

## Product problem

P5.34 confirmed that a fixed 2-beat duration-overlap window can contain sustained/carryover tones from neighboring harmony. In the real failure topology those contaminated windows can become over-dense, allowing broad candidates to over-explain evidence and beat a correct narrower candidate that was generated successfully.

This is not merely a generic ranking bug.

It is a **temporal evidence quality problem that manifests as ranking failure**.

## Objective

Create a deterministic, explainable evidence model that can distinguish:

- current harmonic attack;
- sustained current harmony;
- common tone across a change;
- carryover from a previous harmony;
- structural bass;
- short transient / ornament;
- uncertain evidence.

Then test whether it improves contaminated-window ranking without regressing legitimate:

- 9 / 11 / 13 chords;
- altered chords;
- sus;
- m7b5;
- inversion/slash;
- pad / legato;
- held piano harmony;
- common tones;
- arpeggios;
- genuine two-chord boundaries.

## Non-goals

- meter/bar/text fragmentation fix;
- global 1/4 → 4/4 rewrite;
- vocabulary expansion for S02/S04;
- Preserve-first persistence;
- sourcePerformance persistence;
- low-confidence UI;
- broad Analyzer replacement.

## Stages

1. `P5.35-00` — audit / baseline / promotion thresholds
2. `P5.35-01` — shadow temporal evidence classifier
3. `P5.35-02` — shadow carryover-resistant ranking
4. `P5.35-03` — promotion evaluation
5. `P5.35-04` — bounded production integration **only if promotion passes**
6. `P5.35-05` — hardening / product acceptance

If P5.35-03 fails:

```text
P5.35-04 = NOT AUTHORIZED
```

Speed is secondary to correctness and automated regression safety.
