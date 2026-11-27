# Generalization and Anti-Overfit Contract

Any later correction must be a general rule, not a repair for FC-SAFETY-03 specifically.

## Forbidden mechanisms

- anonymous-ID branches;
- exact source-position lookup;
- exact note-set lookup;
- private-source fingerprint lookup;
- root-specific exception without independent general evidence;
- expected-answer tables in production/ranking logic;
- special score bonuses for the reviewed target;
- hidden fallback to the known reviewed answer;
- threshold selection solely because it fixes the private target.

## Evidence required before Stage01 correction

A proposed root cause should have at least one of:

- a privacy-safe synthetic reproduction;
- an existing protected failure/control showing the same mechanism;
- a generalized mathematical/evidence inconsistency in the scorer;
- multiple independent local examples.

## Negative controls

Any future correction must test simple major/minor/dominant/suspended/slash/omission-sensitive controls so a new rule does not over-label ordinary harmony.

## Counterfactual requirement

For every proposed correction, state:

- which cases it is intended to change;
- which cases must remain unchanged;
- the exact general condition that separates them;
- why the condition is source-derived rather than target-ID-derived.
