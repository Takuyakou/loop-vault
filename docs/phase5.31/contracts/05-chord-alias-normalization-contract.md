# Contract 05 — Chord Alias / Normalization

Use the existing Loop Vault chord identity parser as authority.

Test at least:

```text
BbM7
CM7
Cmaj7
C△7
CΔ7
Cm7
Caug
Csus2
Csus4
Cadd9
Cadd11
Cdim
Co7
C7(b9)
C7(#9,#5)
C7(b9,#11,b13)
Comit3
Am9/C
Dm7/G
```

Only add normalization where:

1. musical identity is unambiguous;
2. current parser can represent the identity;
3. canonical output does not silently discard alterations/bass.

Historical ReChord/chord-translator aliases are research input, not automatic
requirements.

Explicitly protect ambiguous forms such as `C#5`; do not redefine them silently.
