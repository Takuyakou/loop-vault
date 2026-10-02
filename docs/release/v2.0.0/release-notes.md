# Loop Vault v2.0.0

Version: 2.0.0. Build verification date: 2026-10-03 (Asia/Tokyo).

## MIDI / Text / Correction Workspace

- Shared MIDI and Standard / Extended Text capture, with clearer audition, correction and save operations.
- Timeline-based interval selection, split/merge controls, correction notices, chord editing and section/memo handling.
- Source-first playback preserves stored explicit MIDI/custom notes. A tempo-less SMF uses the standard effective 120 BPM default; practice tempo changes do not overwrite source provenance.
- Existing Vault fileVersion 2 stays in use. Valid records that are unavailable for a practice mode are preserved.

## Voicing Loop

- Current and upcoming chords, timeline, 88-key keyboard and compact transport in one responsive layout.
- Distinct saved/source MIDI/custom/generated voicings; unavailable choices are disabled and partial availability is visible.
- Basic/Core generation plus detailed shape, left-hand, Color/Open settings; fixed sources keep their stored notes.
- Session-only A–B Range Loop, chord-snapped timeline/card selection, keyboard control and range clearing.
- Improved initial attack, restart clock synchronization, card audition and detailed-setting dismissal.
- Approved E1-T / existing Hand Position Proxy / inverse / lambda=2 / weak Common Tone gamma=1 recommendations. Saved fingerings stay fixed; previous CURRENT behavior remains available through session-only Developer settings. No new candidates, notes, hands, Span/Black-key rules or Hand Position Guide.

## Reliability

Responsive/accessibility fixes and Test DX runner changes retain full release coverage. Final fresh validation at `d70623ae`: Vitest 3,792/3,792, Playwright 225/225 and Rust 42/42 PASS, with no PASS cache and 0 FAIL / 0 UNRUN. Details and scope limitations are recorded in [release-validation](release-validation.md).

The release lockfiles include narrow brace-expansion and rustls/rustls-webpki security patches; no framework-wide upgrade or test-contract change.

## Compatibility / limitations

- SemVer 2.0.0 does not mean Vault v3. Vault fileVersion is still 2, with no release-specific migration.
- Current Product Core / analyzer / extractor / Identity-Decoder remain; unpromoted Core v2 experiments are not enabled.
- Voicing Loop retains constant-meter scope and unsupported meter/tempo-change limitations.
- Text does not provide original MIDI voicings; select saved/custom/generated notes as available.
- Recommended fingerings use a proxy, not ergonomic Gold. Residual cluster reassignment regressions remain; no parameter retuning was done for release.
- The former AI Advisor UI is removed. Its previously stored key can be deleted in Settings.

## Windows distribution

A direct executable, NSIS setup and MSI installer follow the existing release convention. WebView2 Runtime is required. Built assets/checksums are listed in [release-assets](release-assets.md). User Vault/private recordings and local evaluation data are not included.

Release page: [Loop Vault v2.0.0](https://github.com/Takuyakou/loop-vault/releases/tag/v2.0.0).

Publication verification: all four public assets re-downloaded after release; size and SHA-256 match the local build and checksum manifest.
