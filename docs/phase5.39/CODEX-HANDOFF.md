# Codex Handoff — P5.39 Family C

You are taking over Loop Vault after P5.38.

## What is already solved

- Family A: downstream 1/4 presentation fragmentation — production fix, default ON.
- Family B: fixed-2-beat union chimera / wrong-root slash — production fix, default ON.
- Family C: vocabulary / representability — OPEN.

Do not reopen A/B without new contradictory evidence.

## Family C definition

The analyzer can sometimes recover useful pitch evidence but the closed chord
vocabulary cannot encode the harmonic identity precisely. The result is forced
into a nearby supported symbol.

Historical representative families include:
- explicit altered-dominant identities with omissions;
- 11th-family identities with omitted 5th;
- other extended / altered / omission-sensitive identities.

These are not literal target strings to whitelist.

## Required generalization

Every new identity family must be tested by **root-relative interval structure**:

```text
12 roots × family × voicing variants × octave/doubling variants
```

Expected invariances:
- transposition invariant;
- octave invariant;
- doubling invariant;
- voicing/order invariant;
- inversion-safe;
- slash bass preserved separately;
- no private fixture id or absolute pitch sequence in logic.

## Important notation rule

Do not use ambiguous `alt` as the canonical result. Prefer explicit observed
alterations/omissions, e.g. `7(#9,b13,no5)` style when actually supported.
Canonical ordering/spelling must be deterministic and parser/formatter round-trip.

## Architecture caution

Do not conflate:
- source MIDI exact pitches/voicing;
- chord pitch-class identity;
- display notation;
- candidate ranking.

Family C primarily concerns **representability/identity vocabulary**. If ranking
still fails after the correct candidate becomes representable, classify it as a
separate ranking effect rather than hiding it in the vocabulary patch.

## Quality priority

Correctness and generality > implementation speed.
Automate 12-root/metamorphic testing; do not rely on manual spot checks.

## Private fixture

Use only anonymous id `LF-MIDI-001` in tracked material. Private evaluation is last,
after generated/public-safe policy freeze.

## Stop rule

At each stage respect the phase workflow. No merge/push/tag/release and no next
phase creation without authorization.
