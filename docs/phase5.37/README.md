<!-- phase-id: 5.37 -->

# Phase 5.37 — Production Fix / Integration

## Status

- **Status:** **BLOCKED at P5.37-01** — reuse-based meter-independent shadow needs an authorized decision (minimal production parameterization vs 410-line fork); production behavior NOT authorized
- **Active stage:** P5.37-01 (meter-independent local-state shadow — [`reports/P5.37-01-meter-independent-shadow.md`](reports/P5.37-01-meter-independent-shadow.md))
- **Completed stages:** P5.37-00 (audit / gate freeze — [`reports/P5.37-00-audit-gate-freeze.md`](reports/P5.37-00-audit-gate-freeze.md))
- **Depends on:** P5.36 closeout `77c8b0e` (PASS — CURRENT-ATTACK / METER CAUSAL VALIDATION COMPLETE; P5.37 TARGET READY), in ancestry
- **Primary target:** Family B (fixed-2-beat evidence mixing). Family A = OPTIONAL / DEFERRED workstream.
- **Order (locked):** shadow → promotion → production. Production integration only if PROMOTION = PASS.

## Required Reading Order

1. root `AGENTS.md`, root `CLAUDE.md`
2. `docs/ai-handoff/README.md`, `HANDOFF.md`, `DECISIONS.md`, `KNOWN-FAILURES.md`
3. P5.34 closeout / semantic controls; P5.35 promotion-fail / closeout; P5.36 closeout / causal verdict / P5.37 proposal
4. [`00-START-HERE.md`](00-START-HERE.md)
5. [`work-instructions.md`](work-instructions.md)
6. [`execution-state.json`](execution-state.json)
7. [`contracts/01-scope-and-authority.md`](contracts/01-scope-and-authority.md) … `08-p537-success-and-failure.md`
8. [`reports/P5.37-00-audit-gate-freeze.md`](reports/P5.37-00-audit-gate-freeze.md)

## Stages

1. `P5.37-00` — audit / branch allocation / gate freeze
2. `P5.37-01` — meter-independent local-state shadow prototype
3. `P5.37-02` — promotion evaluation (hard PASS/FAIL)
4. `P5.37-03` — production semantic integration **only if PROMOTION = PASS**
5. `P5.37-04` — optional Family A downstream fragmentation workstream
6. `P5.37-05` — full regression / private acceptance / hardening
7. `P5.37-06` — closeout

## Goal

Convert the P5.36 confirmed causal result into a bounded, reversible production fix.

Primary target:

```text
existing local-harmonic-state engine
+
meter-independent eligibility
+
coherent local-state evidence
+
existing scorer / vocabulary
```

rather than fixed 2-beat mixed evidence for cases where a strong local harmonic-state change is detected.

## Existing reuse target

P5.36 identified strong partial reuse around:

```text
localHarmonicStateIntegration.ts
segmentation.ts
harmonicState/*
harmonicIdentity
prepareLocalHarmonicStateAnalyzerOptions
enableLocalHarmonicStateConsolidation
```

Exact paths/functions must be re-audited against current Git.

The key existing blocker is the 4/4-only gate / `unsupported-meter` path.

## Compatibility principle

Prefer preserving unchanged:

```text
candidate vocabulary
candidate templates
scoreTemplates / matchWindow semantics
bass extraction
source notes
Vault schema
fileVersion
Source Voicing / Source Bassline
playback
```

If any of these must change, evidence and explicit authorization are required.

## Rollback principle

During shadow / promotion / initial production integration:

```text
flag OFF → exact legacy behavior
```

must remain available and test-locked.

## Quality priority

Correct harmonic interpretation takes priority over small increases in analysis time.
However runtime must remain bounded, deterministic, and free of exponential/unbounded search.

## Automation-first

Drive the phase with automated synthetic fixtures, corrected corpus, hard negatives, private ignored-local fixture, whole-file regression, official analyzer regression, determinism, bounded-cost stress, and privacy checks. Human acceptance is final confirmation only.
