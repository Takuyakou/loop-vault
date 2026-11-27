# Loop Vault v1.1.0

Loop Vault v1.1.0 expands the practice workflow from captured or typed chord progressions through focused bass, rhythm, root-motion, and voicing exercises.

## Highlights

### More capable Bass Practice

- Degree Echo, Rhythm Echo, and Bassline Echo now share a clearer, localized practice flow.
- Chord Context can use generated progressions or progressions selected from the Vault.
- Bassline Echo includes nine deterministic presets, legacy generated-default compatibility, and 4-, 8-, or 12-bar practice material.
- Rhythm and Bassline sessions have clearer phase feedback, safer stop/restart behavior, session tempo controls, history, and improved responsive layouts.
- Record & Compare supports recording, listening, keeping takes, and reviewing retained takes without automatic scoring.

### Root Motion Echo

- Practice root movement as adjustable 2- to 8-note chains.
- Use generated material or eligible Vault progressions.
- Review the ordered movement on the fretboard, continue through Transfer, and retain practice history.

### Text Progression Entry and voicing

- Type chord progressions directly in Capture with bar-aware cards, canonical chord labels, validation diagnostics, key confirmation, and explicit tempo.
- Audition generated voicings or capture an exact custom voicing from a MIDI keyboard before saving.
- Saved text progressions remain available to the Vault, Chord Dojo, and eligible Bass Practice workflows.
- MIDI keyboard monitoring uses the bundled piano instrument so captured voicings are easier to verify by ear.

### Vault and practice handoff

- Vault progression titles and sections are easier to discover, search, and select.
- Chord Context and Root Motion eligibility is reported without inventing missing key, timing, or source-MIDI information.
- Existing practice and detail screens received keyboard, accessibility, responsive-layout, and reduced-motion improvements.

### Improved MIDI voice understanding

- Voice Role v2 classifies bass, harmony, pad, melody, percussion, mixed, and ambiguous material with clearer High/Medium/Low confidence and privacy-safe evidence.
- The opt-in Harmonic Core preset emphasizes harmony and pad Voices while suppressing bass, percussion, and melody contributions during voice-aware analysis.
- Within mixed Voices, melody-like notes can be down-weighted for Harmonic Core analysis without mutating the source MIDI or the displayed piano roll.
- The pre-analysis piano roll and result summary make the selected analysis mode and its effect visible before and after analysis.

## Compatibility

- No breaking changes are introduced by v1.1.0.
- No user data migration is required.
- Existing Vault data remains on the current file format, and new Practice settings use backward-compatible defaults.
- Existing generated Bassline behavior remains available through legacy generated-default compatibility.

## Distribution

The Windows release is prepared as a direct executable, an MSI installer, and an NSIS setup executable. Checksums are published with the final release assets.