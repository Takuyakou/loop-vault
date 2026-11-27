# Loop Vault P5.37 — Production Fix / Integration

## Purpose

P5.37 is the production-fix phase for the two independent causes confirmed by P5.36.

### Family A — downstream fragmentation

```text
1/4 meter metadata
→ beatsPerBar = 1
→ downstream bar / block / formatted-text fragmentation
```

State: `CONFIRMED`

### Family B — wrong-root harmonic identity

```text
fixed 2-beat evidence window
→ distinct local harmonic states are merged
→ evidence union
→ chimera / wrong-root / broad-slash candidate wins
```

State: `CONFIRMED`

P5.37's **primary semantic target** is Family B.

The selected bounded strategy from P5.36 is:

> Generalize the existing P5.24/P5.26 local-harmonic-state segmentation /
> consolidation path from its current 4/4-only gate to meter-independent
> operation, while keeping source meter facts intact and reusing the existing
> candidate vocabulary / scorer / bass extraction wherever possible.

Family A is a **separate optional workstream** with independent gates.
Do not couple the semantic fix to a 1/4→4/4 source rewrite.

## Required phase order

```text
P5.37-00  Audit / branch allocation / gate freeze
P5.37-01  Meter-independent local-state SHADOW prototype
P5.37-02  Promotion Evaluation
P5.37-03  Production semantic integration — ONLY IF Promotion PASS
P5.37-04  Optional Family A downstream fragmentation workstream
P5.37-05  Full regression / private-fixture acceptance / hardening
P5.37-06  Closeout
```

Do not reorder `shadow → promotion → production`.

## Phase-number collision check

This package assumes `P5.37`.

Before creating `docs/phase5.37/`:
1. inspect current Git;
2. verify `docs/phase5.37/` is unallocated;
3. verify P5.36 is closed as:

```text
PASS — CURRENT-ATTACK / METER CAUSAL VALIDATION COMPLETE; P5.37 TARGET READY
```

4. verify the P5.36 closeout commit is in ancestry.

If P5.37 is already allocated: STOP; do not overwrite; report the collision; do not renumber without explicit human authorization.

## Canonical read order

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/ai-handoff/README.md`
4. `docs/ai-handoff/HANDOFF.md`
5. `docs/ai-handoff/DECISIONS.md`
6. `docs/ai-handoff/KNOWN-FAILURES.md`
7. P5.34 closeout / semantic controls
8. P5.35 promotion-fail / closeout
9. P5.36 closeout / causal verdict / P5.37 proposal
10. this package
11. current production code/tests

Git truth overrides this seed if names/paths differ.

## Non-negotiable causal facts

### Confirmed

```text
Family A:
meter metadata → downstream fragmentation

Family B:
fixed-2-beat mixed evidence → wrong-root / chimera identity
```

For the real wrong-root family:

```text
union-only winner = 4/4 anonymous targets
wrong root wins neither beat = 4/4
support spans both beats = 4/4
```

Bass extraction itself was not the primary failure. The valid later-state bass was reinterpreted as slash bass under the chimera root.

### Rejected as primary causes

```text
meter metadata alone → chord identity
carried-in sustain
bass extraction
simple note density
candidate generation for observed real cases
```

### Separate issue family

```text
vocabulary / representability
```

Examples like the prior S02/S04 family remain separate. P5.37 must not expand scope into vocabulary redesign.

## Explicitly rejected naive fixes

Do NOT use these as the primary fix:
- global 1-beat windows;
- global 1/4→4/4 semantic normalization;
- broad-chord/min11/13 penalty;
- fewer-notes-is-better scoring;
- force bass = root;
- hard-coded label rewrite;
- P5.35 carryover attenuation promotion;
- private-fixture-specific chord exceptions.

The source failure must be fixed at the harmonic-state evidence level.

## Expected final outcome

Best-case:

```text
PASS — PRODUCTION SEMANTIC FIX INTEGRATED AND HARDENED
```

If Promotion fails:

```text
PASS — SHADOW IMPLEMENTED; PROMOTION FAILED; PRODUCTION UNCHANGED
```

If blocked:

```text
BLOCKED — <reason>
```

No P5.38 may be created automatically.
