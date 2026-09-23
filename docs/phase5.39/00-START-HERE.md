# Loop Vault P5.39 — Family C: Vocabulary / Representability Generalization

## Purpose

P5.39 addresses the final currently-known major MIDI-import failure family:

```text
Family C
source harmonic evidence is usable
BUT
current closed chord vocabulary cannot represent the observed identity
→ analyzer is forced toward the nearest available label
```

Representative historical examples include omission-/alteration-sensitive dominant
and 11th-family sonorities. They are **examples, not special cases**.

The phase goal is not:

```text
make G7(#9,b13,no5) pass
make B11(no5) pass
```

The phase goal is:

> Generalize representability from root-relative interval structure so the same
> harmonic family works for all 12 roots, independent of voicing/octave/doubling,
> while preserving slash-bass semantics and avoiding over-labeling simple chords.

## Non-negotiable anti-overfit rule

Never add:
- private-fixture note whitelists;
- root-specific special cases;
- literal note-array conditionals;
- "if root == G/B" patches;
- fixture-specific candidate bonuses;
- hidden `alt` labels that avoid explicit alteration spelling.

If a new identity works only for the private MIDI or one root, it is a failure.

## Current issue map entering P5.39

```text
Family A
meter-derived downstream presentation fragmentation
CONFIRMED · FIX IMPLEMENTED · DEFAULT ON

Family B
fixed-window union chimera
CONFIRMED · FIX IMPLEMENTED · DEFAULT ON

Family C
vocabulary / representability
OPEN · this phase
```

P5.39 must protect Families A and B exactly.

## Required phase order

```text
P5.39-00  repository/vocabulary audit + baseline + gates freeze
P5.39-01  root-relative identity grammar + representability oracle (shadow)
P5.39-02  generalized candidate/notation shadow + metamorphic corpus
P5.39-03  Promotion Evaluation
P5.39-04  Production integration — ONLY after Promotion PASS
P5.39-05  hardening / default decision / acceptance
P5.39-06  closeout
```

Do not skip `shadow → promotion → production`.

## Phase-number collision check

Before allocation:
1. verify `docs/phase5.39/` is unallocated;
2. verify P5.38 is closed with Family A default-on;
3. verify P5.37 Family B closeout is in ancestry;
4. inspect branch/HEAD/status;
5. do not overwrite or renumber without human authorization.

## Canonical read order

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/ai-handoff/README.md`
4. `docs/ai-handoff/HANDOFF.md`
5. `docs/ai-handoff/DECISIONS.md`
6. `docs/ai-handoff/KNOWN-FAILURES.md`
7. P5.34 semantic/representability reports
8. P5.37 closeout
9. P5.38 closeout
10. this package
11. current Git code/tests

Git truth overrides this seed.

## Final target

Best case:

```text
PASS — FAMILY C GENERALIZED REPRESENTABILITY FIX INTEGRATED AND HARDENED
```

No P5.40 is created automatically. A later final MIDI-import acceptance phase may
be proposed, but requires separate human authorization.
