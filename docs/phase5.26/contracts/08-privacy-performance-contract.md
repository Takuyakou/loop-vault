# Contract 08 — Privacy / Performance

Real user MIDI:
- ignored/local only
- anonymous fixture ID
- no personal absolute path
- no raw note dump in committed report

Commit deterministic synthetic fixtures.

Avoid global O(N^2).
Prefer:
- sorted events
- beat/bar index
- bounded context
- cached local summaries

Accuracy > speed, but runtime must be bounded and benchmarked.
