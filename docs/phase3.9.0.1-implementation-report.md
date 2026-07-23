# Phase 3.9.0.1 Implementation Report

## Status

- Automated verification: complete
- Browser visual verification: complete
- Physical MIDI keyboard verification: pending
- Windows close-button verification with an active Practice session: pending
- Phase 3.9.0.1: provisionally complete

## Summary

Phase 3.9.0.1 replaces the Chord Dojo vertical-stripe keyboard with a reusable
SVG piano visualizer and fixes the close-time race between pending Practice
progress and the Vault close flush.

The implementation keeps the existing Live MIDI transport, Practice Matcher,
100 ms stable confirmation, Voicing Resolver, Practice progress model,
PlaybackController, Vault schema, `fileVersion = 1`, and MIDI Analyzer.

## K0 Audit

Files:

- `docs/phase3.9.0.1-keyboard-visualizer-audit.md`
- `docs/phase3.9.0.1-piano-keyboard-visualizer-plan.md`

Confirmed:

- The previous keyboard used equal-height flex stripes.
- `PracticeView` already consumed the shared Live MIDI note state.
- held and sustained state remained channel-aware internally.
- Practice matching used held notes only.
- the existing note-name helper used MIDI 60 = C4.
- the pending Practice session was committed at view unmount, after the Tauri
  close guard could already have flushed the Vault.

## K1 Note Display And Geometry

Directory:

`src/components/music-keyboard/`

Implemented pure functions for:

- FL Studio octave display, including MIDI 60 = C5
- sharp and flat note spelling
- C-only labels
- four-to-five-octave Practice range
- C-boundary snapping
- valid lower and upper MIDI edges
- outside-range note reporting
- white and black key geometry
- visual state precedence
- display-state de-duplication

The existing `src/components/voicing/midiNoteName.ts` was not changed, avoiding
an octave-label regression outside Chord Dojo.

## K2 Reusable SVG Piano

Files:

- `src/components/music-keyboard/PianoKeyboardVisualizer.tsx`
- `src/components/music-keyboard/PianoKey.tsx`
- `src/components/music-keyboard/PianoKeyboardVisualizer.test.tsx`

Implemented:

- full-height white keys
- shorter and narrower black keys
- black-key overlap at white-key boundaries
- white layer followed by black foreground layer
- C labels only
- guide, held, foreign, sustain, guide-and-held, and guide-and-sustain states
- foreign-state precedence
- sustain stripes
- guide-and-held outline and marker
- guide and held Bass markers without adding another key color
- localized legend
- range-edge input indicators
- horizontal keyboard scrolling without page overflow
- one non-focusable `role="img"` with a localized state summary

No virtual keyboard input was added.

## K3 Live MIDI Wiring

Files:

- `src/components/practice/PracticeKeyboard.tsx`
- `src/components/practice/PracticeKeyboard.test.tsx`
- `src/views/PracticeView.tsx`

`PracticeKeyboard` subscribes directly to
`defaultLiveMidiStore.notes` and uses the existing `heldNotes()` and
`sustainedNotes()` selectors. The display therefore updates on the next React
render after the shared note state changes and does not wait for Practice's
100 ms stable confirmation.

The existing parent Practice subscription still feeds
`practiceInputFromLiveState()` and the existing session reducer. No second
transport, connection, note state, or matcher was created.

The keyboard range is computed from all resolved Voicings in the selected
progression, so changing the current chord does not move the range.

## K4 Dojo UI

Implemented:

- L1 guide card with note names instead of a MIDI-number sequence
- resolver origin chips for keyboard capture, source MIDI, inferred source, and
  generated fallback
- guide highlighting only at L1
- held, foreign, and sustain feedback at L1 through L3
- L1 held and missing note names
- L2/L3 held and missing note counts without answer-note leakage
- clearer current/next hierarchy
- compact round and clean-count group
- Japanese and English legend and status text

## Windows Close Fix

Files:

- `src/store/closePreparation.ts`
- `src/store/closeGuard.ts`
- `src/store/closeGuard.test.ts`
- `src/views/PracticeView.tsx`
- `src/views/PracticeView.test.tsx`

The close sequence is now:

1. Run mounted-view close preparations.
2. Commit pending Practice session progress synchronously through
   `updateProgressionBlock()`.
3. Flush the existing Vault store.
4. Yield once and flush one late revision if the store became dirty again.
5. Stop playback and Live MIDI.
6. Invoke the existing Tauri exit command.

The same Practice session object is not written again during unmount after it
has already been prepared for close.

Persistent storage, atomic repository writes, backup rotation, Vault schema,
and `fileVersion` were not changed.

## Automated Verification

- `npm test -- --run`: 134 files, 733 tests passed
- `npm run lint`: passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `cargo test`: 24 tests passed
- `npm run tauri build`: passed
- `git diff --check`: passed

Known build warning:

- Vite reports a JavaScript chunk larger than 500 kB. This is an existing
  bundle-size warning; the build succeeds.

## Browser Visual Verification

Static preview used the real production component and application CSS, then
was removed.

Desktop:

- SVG width: 696 px
- key height: 208 rendered px
- white keys: 29
- black keys: 20
- black source height: 120 vs white source height: 192
- C labels: C3, C4, C5, C6, C7
- console warning/error: 0

390 x 844:

- page horizontal overflow: 0
- keyboard viewport: 340 px
- keyboard scroll width: 712 px
- keyboard horizontal overflow: auto
- C labels retained
- legend wrapped without page overflow

## Build Artifacts

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

Build timestamp: 2026-07-23 15:06 JST

## Remaining Human Verification

- physical white and black key Note On/Off
- CC64 held-to-sustain-to-clear behavior
- displayed response latency
- L1, L2, and L3 answer visibility on hardware
- fixed range across a real progression
- outside-range feedback with low and high hardware notes
- minimum-width scrolling feel
- Windows `X` close while an active Practice session has pending progress
- restart confirmation that pending Practice progress was persisted

See `docs/phase3.9.0.1-keyboard-user-verification.md`.
