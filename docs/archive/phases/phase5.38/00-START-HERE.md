# Loop Vault P5.38 — Family A: Meter-Derived Downstream Fragmentation

## Mission

P5.38 fixes **Family A only**:

```text
source meter = 1/4
→ beatsPerBar = 1
→ downstream bar / block / formatted-text fragmentation
```

This cause was confirmed in P5.34/P5.36 and deliberately deferred through P5.37.

P5.37 Family B is already production-integrated and enabled by default:

```text
fixed 2-beat evidence mixing
→ union chimera / wrong-root slash
→ fixed by enableUnionChimeraPartition
```

Do **not** reopen or redesign Family B in P5.38.

Family C (vocabulary / representability: S02/S04-type cases) remains separate and out of scope.

---

# Core product principle

The source time signature is a source fact.

P5.38 must **not** solve Family A by rewriting:

```text
1/4 → 4/4
```

Instead, decouple:

```text
SOURCE METER / SOURCE BAR TRUTH
```

from:

```text
DOWNSTREAM ANALYSIS / PRESENTATION GROUPING
```

where the current product incorrectly assumes that every source bar is an appropriate progression-display/block unit.

---

# Known evidence entering the phase

Historical real-fixture evidence established that a diagnostic 4/4 *view* over identical source events changed downstream representation approximately from:

```text
1/4 view:
65 bars
46 dashes
10 block items

4/4 diagnostic view:
17 bars
1 dash
6 block items
```

while the underlying fixed-2-beat harmonic identity path remained meter-invariant.

Therefore:

```text
CONFIRMED:
meter metadata drives downstream fragmentation

NOT SUPPORTED:
meter metadata alone drives the Family-B wrong-root identity failure
```

Do not conflate these families.

---

# Expected P5.38 workflow

```text
P5.38-00
Repository audit / baseline / gates freeze

P5.38-01
Shadow downstream-grouping model

P5.38-02
Promotion evaluation

P5.38-03
Production integration ONLY after PROMOTION PASS

P5.38-04
Hardening / default behavior / acceptance

P5.38-05
Closeout
```

P5.38 is intended to complete Family A if the evidence supports a bounded fix.

---

# Collision / ancestry check

Before allocation:

1. inspect current branch / HEAD / status;
2. verify `docs/phase5.38/` is unallocated;
3. verify P5.37 closeout is in ancestry of the working base;
4. verify actual current truth of `enableUnionChimeraPartition`;
5. determine whether P5.37 has already been merged to the default branch — **do not assume it has** from conversation history alone.

If P5.38 already exists, STOP and report collision.

---

# Canonical read order for Codex

1. root `AGENTS.md`
2. root `CLAUDE.md` if present
3. `docs/ai-handoff/README.md`
4. `docs/ai-handoff/HANDOFF.md`
5. `docs/ai-handoff/DECISIONS.md`
6. `docs/ai-handoff/KNOWN-FAILURES.md`
7. P5.34 closeout / relevant meter reports
8. P5.36 meter-normalized identity + closeout
9. P5.37 closeout
10. this package
11. current code/tests

Git truth overrides the seed package.

---

# Final successful state

Preferred closeout:

```text
PASS — FAMILY A DOWNSTREAM FRAGMENTATION FIX INTEGRATED AND HARDENED
```

If shadow cannot be promoted safely:

```text
PASS — FAMILY A SHADOW COMPLETE; PROMOTION FAILED; PRODUCTION UNCHANGED
```

No Family C work may start automatically.
