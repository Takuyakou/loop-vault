# Contract 02 — Generalization / Metamorphic Invariants

Every newly supported identity family must satisfy generated tests for all 12 roots.

## Transposition invariant

If an interval structure is supported at one root, transposing all harmonic tones
and bass by N semitones must produce the equivalently transposed canonical identity.

No root-specific code paths.

## Voicing invariant

Identity must remain stable under:
- octave displacement;
- note ordering;
- open/closed spacing;
- duplicated chord tones;
- reasonable register changes.

## Bass / inversion invariant

Upper harmonic identity is pitch-class/root-relative. Structural bass is modeled
separately so genuine inversions/slash chords remain distinguishable.

## Exact source-voicing non-goal

Chord identity representability does not imply exact MIDI voicing round-trip.
Do not conflate these contracts.

## Test generation

At minimum generate:

```text
12 roots × target family × >= 4 voicing/doubling transforms
```

and explicit slash/inversion variants where semantically meaningful.
