# Contract 04 — Frozen Promotion Gates

Freeze before private-result-driven tuning.

## Gate A — LF-MIDI-001 downstream improvement

Privacy-safe aggregate must materially improve from the pathological legacy representation.

Track at least:
- source meter;
- source bar count if relevant;
- presentation/progression group count;
- formatted bar/group count;
- dash/placeholder count;
- block item count;
- final progression text structure.

Do not require a specific historical 17/1/6 count unless the selected strategy semantically implies it.

## Gate B — Harmonic identity invariance

Family A fix must not alter the already-resolved harmonic identities merely to improve formatting.

Compare timeline identities before and after downstream grouping.

## Gate C — Family B invariance

Default-on union-chimera behavior must remain unchanged.

Known Family-B target outputs and regression tests stay green.

## Gate D — Normal 4/4 parity

Ordinary 4/4 output must remain exact or intentionally equivalent according to the selected grouping contract.

Unexpected text/block changes = FAIL.

## Gate E — Genuine odd/simple meter safety

At minimum exercise supported synthetic:
- 3/4;
- 2/4;
- 1/4 genuine one-beat-bar case if representable;
- other already-supported meter shapes where practical.

Do not make all music look 4/4.

## Gate F — Text / dash semantics

Dash removal alone is not enough.

Ensure placeholders/dashes still represent actual absence/continuation according to product semantics.

## Gate G — Block topology

Block boundaries/items must remain coherent and deterministic.

## Gate H — Source fidelity

Meter/tempo/PPQ/notes unchanged.

## Gate I — Determinism

Repeated run identical.

## Gate J — Bounded cost

No unbounded grouping search.

## Gate K — Official regression

Current official clean suite passes.

## Decision

Exactly:

```text
PROMOTION = PASS
```

or:

```text
PROMOTION = FAIL
```
