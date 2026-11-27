# Contract 04 — Promotion Gates

P5.35-03 decides promotion.

Thresholds must be frozen in P5.35-00 before shadow results.

## Hard gates

A. LF-MIDI-001 contextual failure materially improves.
B. Corrected P5.34 corpus preserves S01/S03/S05/S06/S07.
C. S02/S04 remain representability-limited; do not misclassify them as ranking failures.
D. Held/pad/legato harmony does not regress.
E. Common-tone transitions remain stable.
F. Legitimate representable extended harmony (maj9, m9, dominant9, 11/sus family, 13 family where supported) is not globally simplified.
G. Genuine slash/inversion remains correct.
H. Genuine boundaries/arpeggio/re-strike hard negatives do not regress.
I. Existing analyzer regression stays within a threshold frozen at P5.35-00.
J. Determinism and bounded-cost gate pass.

## Decision

Only:

```text
PROMOTION = PASS
```

or:

```text
PROMOTION = FAIL
```

Any hard-gate failure means no production integration.

Do not weaken thresholds after results.
