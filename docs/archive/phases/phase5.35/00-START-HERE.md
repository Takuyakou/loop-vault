# Loop Vault P5.35 — Context-Aware Harmonic Evidence / Carryover-Resistant Ranking

## Purpose

P5.34 isolated two independent failure families:

1. meter-derived downstream bar/block/text fragmentation;
2. context-contaminated harmonic evidence causing ranking failure under mixed/carryover evidence.

P5.35 addresses **only the second family**.

The phase goal is:

> Distinguish pitch evidence that belongs to the current harmonic state from pitch evidence that is merely carried over from a neighboring state, then use that evidence to make chord ranking resistant to context contamination.

Do **not** start by globally penalizing complex chords or old notes.

## Important P5.34 correction

The corrected synthetic corpus establishes:

- S01 Abmaj9 — representable + correct
- S02 altered G7 — representability-limited
- S03 Bm7 — representable + correct
- S04 B11(no5) — representability-limited
- S05 C/E — representable + correct
- S06 G7sus4 — representable + correct
- S07 Bm7b5 — representable + correct

S02 and S04 are **extended / altered or omission-sensitive representability limits**.
Do not describe both as only "altered-dominant" failures.

## Phase-number collision check

This package assumes **P5.35**.

Before creating `docs/phase5.35/`:

1. inspect current Git;
2. verify P5.35 is not already allocated;
3. verify P5.34 is closed;
4. verify the accepted P5.34 closeout is in branch ancestry.

If P5.35 is already allocated: STOP and report the collision.

## Required first read

1. root `AGENTS.md`
2. root `CLAUDE.md`
3. `docs/ai-handoff/README.md`
4. `docs/ai-handoff/HANDOFF.md`
5. `docs/ai-handoff/DECISIONS.md`
6. `docs/ai-handoff/KNOWN-FAILURES.md`
7. `docs/phase5.34/README.md`
8. P5.34 causal/local/closeout reports
9. this package README
10. execution-state
11. work-instructions
12. contracts
13. actual code/tests

## Core principle

Never assume:

```text
old note = weak note
```

Instead ask:

```text
Does this pitch contribution belong to the current harmonic state,
or is it carryover / overlap / transient evidence from a neighboring state?
```

## Strategy

```text
Audit
→ Shadow temporal evidence model
→ Shadow carryover-resistant ranking
→ Promotion evaluation
→ Production integration only if promotion gates pass
→ Hardening / human acceptance
```

No production connection before promotion passes.
No merge / push / tag / release unless separately authorized.
