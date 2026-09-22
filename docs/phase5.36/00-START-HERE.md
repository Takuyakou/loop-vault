# Loop Vault P5.36 — Current-Attack / Meter Causal Validation

## Purpose

P5.34 isolated meter-derived downstream fragmentation and wrong-root/broad-slash identity failures.
P5.35 then tested the carryover-sustain hypothesis and closed as **shadow research complete; not promoted**: the real failure was dominated by `CURRENT_ATTACK`, not `CARRIED_IN_SUSTAIN`.

P5.36 tests the new leading hypothesis:

> Under the 1/4-meter topology, the fixed 2-beat analysis window may group attacks from more than one real harmonic sub-state into one histogram. Those notes are all "current" relative to the wide window, but not necessarily part of the same harmony.

This phase is **diagnostic / causal-validation only**.

## Planned phase split

```text
P5.36 — current-attack / meter causal validation
→ prove or reject the mechanism

P5.37 — production fix / integration / promotion / hardening
→ only after P5.36 identifies a bounded implementation target
```

Do not collapse P5.36 into P5.37.

## Critical distinction

Do not equate:

```text
CURRENT_ATTACK
```

with:

```text
SAME_HARMONIC_STATE_ATTACK
```

## Collision check

This package assumes **P5.36**. Before creating `docs/phase5.36/`, verify P5.36 is unallocated and P5.35 closeout is in ancestry. If allocated, STOP and report collision.

## Required read order

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/ai-handoff/README.md`
4. `docs/ai-handoff/HANDOFF.md`
5. `docs/ai-handoff/DECISIONS.md`
6. `docs/ai-handoff/KNOWN-FAILURES.md`
7. P5.34 causal/closeout reports
8. P5.35 promotion-fail/closeout reports
9. this package README
10. execution-state
11. work-instructions
12. contracts
13. current code/tests

## Production rule

P5.36 must keep:

```text
production/runtime behavior diff = 0
```

No production meter correction, sub-window engine, score change, ranking change, or candidate change.

## Final outcomes

Only:

```text
PASS — CURRENT-ATTACK / METER CAUSAL VALIDATION COMPLETE; P5.37 TARGET READY
```

or:

```text
PASS — LEADING HYPOTHESIS REJECTED; NEW CAUSAL TARGET REQUIRED
```

or:

```text
BLOCKED — <reason>
```

Then STOP.
