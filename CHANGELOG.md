# Changelog

## 2.1.0 - 2026-11-08

- Rebuild Chord Dojo: 定番の進行 across 12 keys and random keys, Original Practice, long progressions, 2-5-1 Master, saved progressions, and one visible answer step per judged chord.
- Add Jazz Progressions: 12 keys with random key, octave +1, BPM, listening playback, ① 見て弾く and ② 覚えて弾く, and the shared practice frame with repeats.
- Add Bass Practice (degree / rhythm / bassline / root-motion echo, Record & Compare, MIDI bassline judging) with its own storage namespace.
- Unify MIDI connection across the app, add ear practice, and consolidate the practice screens' layout.
- Capture: delete code cards, cut whole bars and close the gap; smoother preview fades.
- Voicing Loop: MIDI-keyboard sound, smooth navigator fill, audio-clock painting on resume, a sectioned progression picker with two-line rows, and Vault favourites pinned on top.
- Vault: backup rotation counts only real backups, resolves `legacy-import.json` correctly, and still loads when tidying backups fails.
- Text intake: read `minMaj7` and `alt`, keep the classification through save and registered Dojo practice, in a separate storage namespace.
- Test hygiene (R-01) and Rust security advisories (R-02): RUSTSEC fixes via `cargo update`, reviewed audit ignores, and the repaired test gates.
- Keep Vault `fileVersion` 2 and the unchanged Vault schema; new practice records use their own namespaces. See [release notes](docs/release/v2.1.0/release-notes.md).

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
