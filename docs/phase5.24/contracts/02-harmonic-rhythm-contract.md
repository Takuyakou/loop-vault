# Contract 02 — Harmonic Rhythm

v1 production scope: 4/4 unless Stage00 proves a safe existing abstraction.

Candidates:
1 / 2 / 4 / 8 quarter-note beats / unknown.

Global-first.

Allowed evidence:
- note activity
- pitch-class activity
- bass-state periodicity
- onset structure
- novelty
- within-cell consistency
- between-cell separability
- metric alignment

Do not use detected chord identity as primary evidence.

Promotion evidence must be the exact A-K result:
- A/B/C/D/G/H/I/J = 4
- E = 2
- F = 8
- K = unknown

A-J must have a supported measured result and must not use legacy fallback. K alone
must fail closed to legacy. Missing/extra fixture ids, all-unknown output, a supported
but incorrect locked result, or any fallback set other than exactly K fails promotion.

Local/section estimator is out of scope.
