# P5.40 — Phase Contract

## Phase objective

Investigate the single unresolved P5.39 safety blocker: FC-SAFETY-03 local harmonic identity / ranking after a directionally correct temporal partition.

P5.39 established that the temporal split can survive Family B and smoothing while the local identities remain wrong. P5.40 therefore starts **after partitioning** and treats boundary creation and smoothing collapse as non-primary hypotheses unless new evidence disproves that conclusion.

## Frozen starting facts

P5.39 closed with:

```text
P5.39 = CLOSED
PROMOTION = FAIL
Family C production promotion = NOT AUTHORIZED
Remaining blocker = FC-SAFETY-03 local harmonic identity / ranking
```

Final P5.39 gate state:

- A PASS — target representability
- B PASS — metamorphic invariance
- C PASS — canonical notation
- D PASS — anti-overlabel
- E PASS — candidate generation
- F PASS — synthetic ranking
- G PASS — known anonymous Family C
- H FAIL — whole-file safety
- I PASS — Family A exact protection
- J FAIL — Family B exact protection
- K PASS* — official regression, with only pre-existing repository-wide ESLint failures
- L PASS — bounded/deterministic/source fidelity

Final whole-file state:

- 33 comparable W2 regions
- 31 W2 identities unchanged / 2 changed
- 3 additional end-to-end changed regions reviewed
- 2 confirmed-correct
- 1 unresolved safety divergence
- unreviewed = 0
- final `SUSPICIOUS = 1`

## Scope

P5.40 may investigate:

- independent local-state ground truth for FC-SAFETY-03;
- exact candidate-score decomposition;
- rank ordering and tie-break behavior;
- evidence contributions for root, quality, bass, explicit modifiers, omissions, missing tones and conflicting tones;
- whether the failure is a general scoring/evidence defect;
- a bounded Shadow-only generalized correction in later stages;
- safety evaluation across existing protected evidence.

## Out of scope until explicitly authorized

- production Family C integration;
- parser/schema/fileVersion migration;
- broad candidate-space expansion;
- arbitrary candidate powersets;
- private-fixture special cases;
- root-specific patches;
- changes to Family A presentation semantics;
- changes to Family B trigger semantics unless later evidence demonstrates Family B itself is the defect;
- smoothing changes unless later evidence demonstrates smoothing itself is the defect;
- automatic reharmonization;
- generated melody;
- scoring UI or user-facing confidence systems unrelated to analyzer correctness.

## Phase success definition

P5.40 is successful only if it produces evidence that distinguishes among:

1. a correct generalizable fix that passes all frozen promotion gates;
2. a useful but not production-safe Shadow improvement;
3. no justified general correction.

A clean FAIL is an acceptable research outcome.
