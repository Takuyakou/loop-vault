# P5.40 Promotion Gates

These gates are phase-level contracts. Stage00 does not attempt to pass them; it only gathers the evidence needed to design a later correction.

## Gate A — local ground truth

Exact or explicitly uncertain independent local ground truth is frozen before correction design.

## Gate B — candidate reachability

The correct identity is representable/generated, or the stage explicitly proves it is not and routes that as a separate representability defect.

## Gate C — diagnosis

The current wrong winner is explained by a reproducible score/evidence mechanism, not by a target-specific narrative.

## Gate D — generalized Shadow correction

A later correction changes behavior only through a general condition and remains Shadow-only until promotion.

## Gate E — protected-correct targets

Must preserve:

- FC-REAL-01;
- FC-REAL-02 temporal behavior;
- FC-SAFETY-01;
- FC-SAFETY-02;
- Family A contracts;
- Family B contracts.

## Gate F — anti-overlabel

Simple and protected harmonic controls do not gain unjustified complex identities.

## Gate G — temporal correctness

FC-SAFETY-03 requires not only a surviving split but ground-truth-consistent local states.

## Gate H — whole-file safety

No unexplained/unresolved end-to-end change remains. Target outcome:

```text
unreviewed = 0
unresolved unsafe = 0
SUSPICIOUS = 0
```

## Gate I — determinism

Repeated results are structurally/byte identical under the same inputs.

## Gate J — boundedness

Default target is to stay within the existing `<=300 candidate visits/window` contract unless a future phase explicitly re-authorizes the performance envelope.

## Gate K — source fidelity

Source bytes, parsed notes, timing, order and persistence coordinates remain unchanged.

## Gate L — official regression

Focused regression, full Vitest, TypeScript/build, scoped lint/contract checks, phase/AI-handoff validation and privacy/diff checks pass; pre-existing repository-wide lint findings must be separated from new findings.

## Promotion rule

A future promotion stage must state exactly one:

```text
PROMOTION = PASS
```

or

```text
PROMOTION = FAIL
```

No partial-pass interpretation authorizes production integration.
