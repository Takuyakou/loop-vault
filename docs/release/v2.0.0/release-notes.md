# Loop Vault v2.0.0

Release preparation date: 2026-10-03 (Asia/Tokyo). Status: candidate, not yet published.

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

Responsive/accessibility fixes and Test DX runner changes retain full release coverage. Validation numbers and tested HEAD are recorded in [release-validation](release-validation.md), after fresh execution without a PASS cache.

## Compatibility / limitations

- SemVer 2.0.0 does not mean Vault v3. Vault fileVersion is still 2, with no release-specific migration.
- Current Product Core / analyzer / extractor / Identity-Decoder remain; unpromoted Core v2 experiments are not enabled.
- Voicing Loop retains constant-meter scope and unsupported meter/tempo-change limitations.
- Text does not provide original MIDI voicings; select saved/custom/generated notes as available.
- Recommended fingerings use a proxy, not ergonomic Gold. Residual cluster reassignment regressions remain; no parameter retuning was done for release.
- The former AI Advisor UI is removed. Its previously stored key can be deleted in Settings.

## Windows distribution

A direct executable, NSIS setup and MSI installer follow the existing release convention. WebView2 Runtime is required. Assets/checksums are listed in [release-assets](release-assets.md) once built. User Vault/private recordings and local evaluation data are not included.
