<!-- phase-id: 5.20 -->
# Contract 06 — Privacy / Safety

Never commit or report personal MIDI, recordings, `.local-evaluation`, absolute
or source paths, device identifiers, raw text from a private source, or inferred
facts about captured audio. Text entry has no source-MIDI evidence and must never
claim original MIDI voicing, analyzer confidence, a filename, or an asset.

P5.20 protects P5.15, Vault and Practice schemas/file versions, Analyzer, MIDI
Exporter, Live MIDI contracts, FreePats assets, P5.17 RecordingTake storage,
P5.18–P5.19 practice contracts, test-output hygiene, tracked visual baselines,
Cargo.toml line endings, and retired `docs/CURRENT_STATE.md`.

Stage commits use explicit paths only. No reset, stash, automatic merge, push,
or P5.21 work is permitted.
