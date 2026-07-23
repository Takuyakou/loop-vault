# Phase 3.9.0.1 User Verification

## Status

- Automated verification: complete
- Browser visual verification: complete
- Physical MIDI keyboard verification: pending
- Windows close-button verification with an active practice session: pending
- Phase 3.9.0.1: provisionally complete

## Build To Run

Executable:

`D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`

Installers:

- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

Build timestamp: 2026-07-23 15:06 JST

## 1. MIDI Device Preparation

- [ ] Close DAWs or utilities that exclusively own the MIDI input.
- [ ] Start the latest `loop-vault.exe`.
- [ ] Open Settings and select the intended MIDI input.
- [ ] Confirm that the device test succeeds.
- [ ] Open Practice and confirm the device name is shown as connected.

## 2. Piano Shape

- [ ] White keys use the full keyboard height.
- [ ] Black keys are shorter and narrower than white keys.
- [ ] Black keys overlap the white-key boundaries.
- [ ] The black-key pattern is two keys, then three keys.
- [ ] Black keys are not hidden behind white keys.
- [ ] Pressing notes does not change key dimensions or shift the layout.

## 3. C Labels And FL Studio Convention

- [ ] C keys alone show labels.
- [ ] MIDI note 48 is shown as C4.
- [ ] MIDI note 60 is shown as C5.
- [ ] MIDI note 72 is shown as C6.
- [ ] Non-C keys have no persistent label.
- [ ] Internal MIDI note numbers are not shown as the normal guide summary.

## 4. Guide

Level 1:

- [ ] The guide Voicing is visible in deep teal.
- [ ] The guide card uses note names such as `Bb3 · C5 · D5`.
- [ ] The guide origin is shown as one of keyboard capture, source MIDI,
  inferred from MIDI, or generated.
- [ ] Holding a guide key changes it to bright mint.
- [ ] Guide and held overlap is also indicated by an outline and dot.
- [ ] Guide Bass has a `BASS` marker.

Level 2 and Level 3:

- [ ] The guide card is absent.
- [ ] Guide key highlights are absent.
- [ ] Held and sustained feedback remains visible.

## 5. Held Notes

- [ ] Press a white key and confirm that the matching key immediately changes.
- [ ] Press a black key and confirm that the matching key immediately changes.
- [ ] Press several notes and confirm that only those absolute keys change.
- [ ] Release each key and confirm that it immediately returns to its prior
  guide or idle state.
- [ ] The display does not wait for the 100 ms match confirmation.
- [ ] Practice match confirmation still waits for the existing stable window.

## 6. Foreign Notes

- [ ] Hold a pitch class outside the current chord requirements.
- [ ] Only that held key becomes amber.
- [ ] An amber outline remains visible in addition to color.
- [ ] The text says `構成外音があります` or `Foreign note detected`.
- [ ] There is no flashing red failure animation.
- [ ] The displayed result agrees with the existing Practice Matcher.

## 7. Sustain

- [ ] Hold a key.
- [ ] Press CC64 sustain.
- [ ] Release the key while keeping the pedal down.
- [ ] The key changes from held color to the blue striped sustain state.
- [ ] Release the pedal and confirm that the sustain state disappears.
- [ ] Sustained notes alone never produce a correct Practice match.

## 8. Input Summary

Level 1:

- [ ] Held notes are shown by FL Studio note name.
- [ ] Missing required notes are shown by note name.
- [ ] A complete match shows `一致`.

Level 2 and Level 3:

- [ ] Input is shown as a note count.
- [ ] Missing notes are shown as a count only.
- [ ] Missing note names are not revealed.

## 9. Fixed Range And Outside Input

- [ ] Select a progression with both low and high guide Voicings.
- [ ] Move through every target chord.
- [ ] The keyboard range does not move between chords.
- [ ] Press a note below the visible range.
- [ ] A left-side outside-range notice shows the note name.
- [ ] Press a note above the visible range.
- [ ] A right-side outside-range notice shows the note name.
- [ ] The keyboard does not expand during the session.

## 10. Narrow Window

- [ ] Narrow the window to its minimum practical width.
- [ ] The page itself has no horizontal overflow.
- [ ] The keyboard area scrolls horizontally.
- [ ] Individual keys keep a playable visual width.
- [ ] Black-key placement remains aligned after horizontal scrolling.
- [ ] C labels remain visible.
- [ ] The legend wraps without text overlap.

## 11. Japanese And English

- [ ] Japanese legend: お手本 / 押鍵中 / 構成外 / ペダル保持.
- [ ] English legend: Guide / Held / Foreign / Sustain.
- [ ] Current, next, round, clean count, guide origin, and input summary switch
  with the app language.

## 12. Disconnect And Reconnect

- [ ] Disconnect the selected MIDI device during a session.
- [ ] Held and sustained key states clear.
- [ ] The keyboard itself remains visible.
- [ ] The Practice session pauses.
- [ ] Reconnect and confirm that the preferred input is selected again.

## 13. Windows Close Button Regression

This specifically verifies the reported message:

`変更を保存できなかったため、Loop Vaultを閉じませんでした。`

- [ ] Start a Practice session.
- [ ] Play at least one chord so in-memory Practice progress changes.
- [ ] Click the Windows `X` button without first pressing the Practice End
  button.
- [ ] The app closes without showing the save-failure message.
- [ ] Restart the app.
- [ ] The progression's latest practice timestamp/progress remains available.
- [ ] Repeat while autosave is visibly in progress.
- [ ] The app closes after the late revision is flushed.
- [ ] Confirm ordinary close behavior from Home, Capture, Vault, and Settings.

## 14. Regression

- [ ] Step practice
- [ ] Flow practice and metronome
- [ ] clean round
- [ ] provisional clear
- [ ] another-day confirmation
- [ ] Live MIDI Mini Mode
- [ ] Progression Detail playback and editing
- [ ] Voicing Memory
- [ ] Vault autosave
- [ ] Quick Editor
- [ ] Progression Advisor

## Issue Report Template

```text
Verification section:
Progression:
Key / BPM:
Practice Level:
Practice mode:
MIDI device:
MIDI notes pressed:
Pedal state:
Window width:
Expected:
Actual:
Reproduction rate:
Screenshot:
Console / log:
```
