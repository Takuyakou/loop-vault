# Contract 07 — Privacy / Performance

Private real MIDI:
- ignored/local only
- anonymous fixture IDs
- no private path/title/raw note dump in committed reports
- no tracked private MIDI/audio

Performance:
- avoid global O(N^2)
- prefer sorted events / interval sweep / beat-bar indexing / bounded neighborhoods
- deterministic
- bounded runtime/resource checks

More analysis time is acceptable when it materially improves accuracy, but runaway complexity is not.

Maintain security-hardening and test-output-hygiene contracts.
