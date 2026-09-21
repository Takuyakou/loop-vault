# Contract 03 — Shadow Carryover-Resistant Scoring

P5.35-02 must not replace production rank-1.

Reuse current candidate generation and base scoring where possible.

Conceptually:

```text
legacy candidate score
+
context-aware evidence adjustment
=
shadow candidate score
```

Do not create a second candidate generator.

For each candidate record where useful:

- legacy rank/score;
- shadow rank/score;
- matched observed PCs;
- unexplained observed PCs;
- candidate-only PCs;
- structural-bass support;
- quality-defining-tone support;
- temporal evidence by role;
- score delta by reason.

## Candidate-only safety

A diagnostic penalty must not punish legitimate:

- omitted fifth;
- jazz/pop omissions;
- external bass;
- optional/implicit tensions;
- current documented vocabulary behavior.

## Narrowest-consistent safety

Never implement:

```text
fewer pitch classes = better chord
```

A narrower candidate may win only when broader support is shown to come mainly from contamination.

## Characteristic tones

Protect evidence for:

- 3 / b3;
- b7 / maj7;
- sus4;
- b5 for m7b5;
- observed supported alterations.

Temporal adjustment must not erase defining tones simply because they are sustained.
