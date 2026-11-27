# Test Strategy

## Goal

Minimize human testing while maximizing analyzer correctness and regression safety.

## Stage00 automated checks

At minimum:

- candidate enumeration count;
- scorer parity with frozen baseline;
- diagnostic output determinism;
- score-decomposition arithmetic recomposition;
- all candidate ranks reproducible;
- source immutability;
- ignored-local privacy guard;
- no production imports of Stage00 diagnostic helpers;
- focused P5.39/P5.38/P5.37/chord/scoring tests;
- TypeScript;
- changed-scope ESLint;
- class lint;
- source-contract lint;
- phase-doc validation;
- AI-handoff validation;
- `git diff --check`.

## Later Shadow evaluation

When Stage01/02 are authorized, add:

- synthetic reproduction corpus;
- metamorphic transforms: order/register/octave/doubling where semantically invariant;
- major/minor/dominant/suspended/slash controls;
- explicit omission / alteration controls;
- protected Family A/B cases;
- all five reviewed anonymous IDs;
- whole-file private aggregate evaluation;
- performance/candidate-bound measurement;
- repeated determinism runs.

## Full regression before promotion

Before any `PROMOTION = PASS`:

- full Vitest;
- app TypeScript;
- E2E TypeScript where applicable;
- production web build;
- focused relevant Playwright if affected surfaces require it;
- lints and validators;
- dependency/security gates if changed scope warrants them;
- source/private-data guard;
- production diff review.

## Human role

Human review should be reserved for evidence that cannot be mechanically ground-truthed, especially musical identity adjudication. Once ground truth is frozen, all subsequent comparisons should be automated.
