<!-- phase-id: 5.36 -->

# Phase 5.36 — Current-Attack / Meter Causal Validation

## Status

- **Status:** in-progress (diagnostic / causal-validation only — no production integration)
- **Active stage:** P5.36-05 (hardening / closeout)
- **Completed stages:** P5.36-00 (audit — [`reports/P5.36-00-audit-baseline.md`](reports/P5.36-00-audit-baseline.md)), P5.36-01 (attack provenance — `SUPPORTED-HYPOTHESIS`), P5.36-02 (meter A/B — Outcome M2), P5.36-03 (sub-window decomposition — **CONFIRMED**), P5.36-04 (causal verdict + P5.37 proposal — [`reports/P5.36-04-causal-verdict.md`](reports/P5.36-04-causal-verdict.md), [`reports/P5.36-04-p537-proposal.md`](reports/P5.36-04-p537-proposal.md); target = generalize existing P5.24/P5.26 local-harmonic-state engine off its 4/4 guard)
- **Depends on:** P5.35 closeout `93282e0` (PASS — SHADOW RESEARCH COMPLETE; NOT PROMOTED), in ancestry
- **Production behavior:** NOT authorized (Contract 01) · production/runtime diff = 0

## Required Reading Order

1. root `AGENTS.md`, root `CLAUDE.md`
2. `docs/ai-handoff/README.md`, `HANDOFF.md`, `DECISIONS.md`, `KNOWN-FAILURES.md`
3. P5.34 causal/closeout reports, P5.35 promotion-fail/closeout reports
4. [`00-START-HERE.md`](00-START-HERE.md)
5. [`work-instructions.md`](work-instructions.md)
6. [`execution-state.json`](execution-state.json)
7. [`contracts/01-scope-and-stop-boundary.md`](contracts/01-scope-and-stop-boundary.md) … `07-p537-entry-criteria.md`
8. [`reports/P5.36-00-audit-baseline.md`](reports/P5.36-00-audit-baseline.md)

## Background

P5.35 showed that the real private failure was overwhelmingly `CURRENT_ATTACK`, while carryover attenuation left the real wrong-root slash labels materially unchanged. Therefore P5.36 asks:

> Are multiple attacks from distinct real harmonic sub-states being grouped into the same fixed 2-beat window under the 1/4-meter topology?

If yes, `CURRENT_ATTACK` is too coarse at the 2-beat-window level.

## Primary hypothesis

```text
1/4 topology
+
fixed 2-beat analysis window
+
multiple attacks from distinct beat/sub-state regions
→ one over-dense histogram
→ broad/wrong-root slash candidates gain excessive support
```

This is a **leading hypothesis**, not confirmed at phase start.

## Core tasks

1. trace attacks in problematic windows back to beat/sub-window provenance;
2. compare original 1/4 vs diagnostic 4/4 view on chord identity itself;
3. test whether beat/sub-window partition restores the intended candidate ranking;
4. decompose correct vs wrong-root candidate score support;
5. identify the exact production target for P5.37.

## Non-goals

- production 1/4→4/4 rewrite;
- production meter normalization;
- production sub-window segmentation;
- production ranking changes;
- candidate-generation changes;
- vocabulary expansion;
- carryover attenuation promotion;
- Preserve-first/sourcePerformance persistence;
- UI/Vault schema changes.

## Stages

1. `P5.36-00` — audit / baseline / contract lock
2. `P5.36-01` — attack provenance instrumentation
3. `P5.36-02` — meter-normalized chord-identity A/B experiment
4. `P5.36-03` — beat/sub-window shadow isolation + score decomposition
5. `P5.36-04` — causal verdict + exact P5.37 proposal
6. `P5.36-05` — hardening / closeout

No P5.37 package is created in P5.36.
