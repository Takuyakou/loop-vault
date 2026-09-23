# Loop Vault — P5.40 Local Harmonic Identity / Partition Ranking Correction

## Purpose

P5.40 is a separate follow-up research phase after P5.39 closed with:

```text
P5.39 = CLOSED
PROMOTION = FAIL
Family C production promotion = NOT AUTHORIZED
Remaining blocker = FC-SAFETY-03 local harmonic identity / ranking
```

P5.40 does **not** reopen P5.39 and does **not** begin with production integration.
Its narrow research question is:

> After the necessary temporal partition has been found, why does the wrong local harmonic identity win, and can that cause be corrected by a general rule without regressing existing correct behavior?

## Start here

1. Read `00-phase-contract.md`.
2. Read `01-current-state-and-p539-handoff.md`.
3. Read `02-protected-contracts.md` through `09-stop-boundaries.md`.
4. Execute **only** `P5.40-00-audit-ground-truth-ranking-diagnosis.md`.
5. Stop at its boundary. Do not begin P5.40-01 unless separately authorized.

For Codex, `CODEX-START-HERE.md` is the concise execution handoff.

## Stage map

```text
P5.40-00  Audit + independent local ground truth + full candidate score breakdown
           + root-cause diagnosis
           NO FIX / NO RETUNE

P5.40-01  Generalized Shadow correction design + implementation
           only if Stage00 identifies a generalizable cause

P5.40-02  Shadow evaluation on synthetic, metamorphic, protected and whole-file evidence

P5.40-03  Final Promotion evaluation against frozen independent truth

P5.40-04  Production integration
           only after explicit PROMOTION = PASS and separate authorization
```

## Core principle

The goal is not to force Family C to pass. The goal is to determine whether a bounded, deterministic, generalizable local-identity correction is safe enough for production.

Analysis time is allowed to increase when it improves MIDI import correctness. Prefer automated evidence over manual checking wherever possible.
