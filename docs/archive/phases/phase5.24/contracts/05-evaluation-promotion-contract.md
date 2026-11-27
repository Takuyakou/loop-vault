# Contract 05 — Evaluation / Promotion

Stage00 locks before seeing Stage02 results:

Metrics:
- Fragmentation Ratio = detected harmonic states / ground-truth harmonic states
- Change Precision
- Change Recall
- False Merge Rate
- Over-segmentation Rate
- current canonical boundary match tolerance
- deterministic maximum-cardinality one-to-one boundary matching
- official analyzer tolerances
- J premature stable boundary count (separate from global tolerance)
- semantic state identity matches (label + normalized pitch-class set)
- Bass Lane equivalence and safety violations

Primary safety:
False Merge and Change Recall.

Hard fixtures:
C, D, E, G, J, K.

Promotion input must contain the exact unique complete A-K metric set. Ground-truth
state/change cardinalities are immutable: A1/B1/C2/D2/E4/F2/G2/H1/I1/J2/K6 states,
with changes equal to states minus one. Aggregate metrics
must exactly derive from those fixtures. Fixture, aggregate, official, and benchmark
values fail closed when incomplete, duplicate, NaN, Infinity, or out of range.
Predicted harmonic states must carry label and pitchClasses. C→Am7, C→Cmaj7, and
inversion I use zero-tolerance semantic identity checks in addition to boundary metrics.
Exact A-K Bass Lane results, equivalence, and zero safety violations are mandatory.

When expected changes are empty, an extra predicted boundary has precision 0, recall 1,
False Merge 0, and is rejected through Over-segmentation. J rejects an early stable
boundary even when that boundary is inside the shared 0.25-beat tolerance.

Harmonic Rhythm evidence must be exact A-K: A-D/G-J=4, E=2, F=8, K=unknown;
legacy fallback must be an actual array containing exactly the string K. At the
runtime boundary, deterministic, rawMidiUnchanged, and productionOutputsUnchanged
must each be the boolean true; truthy strings and other type-corrupt inputs fail
closed. Missing/null/non-record top-level or nested fixture, aggregate, official,
Harmonic Rhythm, fallback, or benchmark evidence must return fail-stop promotion
without throwing.

Benchmark promotion evidence must be measured and carry the locked provenance:
synthetic fixture E x128, 3 warmups, 7 samples, 10000 ms timeout, 3072 notes, 3 positive warmup durations, 7 positive sample durations and ratios,
derived median/maximum equality, explicit timeout enforcement, and no timeout. Zero, unmeasured, wrong-count, wrong-source, or
fabricated provenance fails closed.

Promotion FAIL => no Stage03 production integration.

A-K synthetic truth is known by construction.
Real performance MIDI is supporting product evidence, not the sole test set.
