# Changelog

## 2.0.0 - 2026-10-03

- Unify MIDI / Standard and Extended Text intake through the Correction Workspace; improve timeline/range operations and saving.
- Preserve explicit source/custom pitches across playback and source switching; handle the SMF 120 BPM default without changing Vault v2.
- Integrate the Voicing Loop timeline, keyboard, four explicit sources, generated detail settings and session-only A–B Range Loop.
- Improve restart/first-chord audio, popover dismissal, desktop/narrow layouts and accessibility.
- Use the approved E1-T/inverse/lambda2/gamma1 fingering ranker with fixed Saved anchors and session Developer CURRENT fallback; preserve notes and hand assignment.
- Improve test runner diagnostics/cache boundaries and full release verification.
- Remove the formerly advertised AI Advisor UI from the feature list; its earlier saved API key can still be removed in Settings.

Core v2 NO-GO / diagnostic-only proposals remain unpromoted. Vault fileVersion remains 2; no release-specific data migration is introduced. See [release notes](docs/release/v2.0.0/release-notes.md).

## 1.1.0 - 2026-08-12

Historical notes: [v1.1.0](docs/releases/v1.1.0.md).

## 1.0.0 - 2026-08-04

Initial published Windows release.
