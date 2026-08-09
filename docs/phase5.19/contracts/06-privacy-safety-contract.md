<!-- phase-id: 5.19 -->
# Contract 06 — Privacy / Safety
Never commit/report personal MIDI, raw recordings, .local-evaluation, personal paths, device IDs, live Vault title, filesystem source paths. Protect P5.15, Vault schema/mutation, Analyzer, MIDI Exporter, Chord Dojo, Live MIDI, FreePats, P5.17/P5.18/P5.18.1/P5.18.2 contracts, test-output hygiene. Explicit-path Git only; no auto merge/push/P5.20.
## P5.19-00 contract lock

- P5.19-00 has no production-code, Vault-schema, Vault-mutation, Analyzer, MIDI Exporter, Chord Dojo, Live MIDI, FreePats-asset, or P5.15 change.
- Root Motion storage and reports use safe identifiers only. They never retain private media, source paths, live Vault titles, device information, or external inputs.
- The future feature must reuse the existing playback and Record & Compare cleanup contracts: replacement, completion, route leave, tab leave, cancel, and dispose cannot leave audio or recording resources active.
- Commits use reviewed explicit paths. Merge, push, and the next phase/stage require separate human authorization.
