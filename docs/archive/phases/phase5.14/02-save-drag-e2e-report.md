# Phase 5.14 Save and Drag E2E Report

## Product path

The required entry point is Progression Detail. Chord cards remain the first
content surface. The `MIDI` secondary control is in the existing playback and
save row.

- click: opens the Tauri save dialog and writes `.mid`
- Enter / Space: same save path through the native button
- context menu: same save path
- pointer movement below 6 px: remains a click
- pointer movement at or above 6 px: prepares one artifact and starts one
  native file drag

The control shows its voicing source, busy state, disabled reason, and a safe
recovery message. A failed native drag recommends click-save instead.

## Automated E2E

`e2e/phase5.14-midi-export.spec.ts` verifies:

- feature flag OFF rollback
- Progression Detail navigation
- chord cards precede the MIDI control
- tooltip and accessible name
- click-save
- keyboard save
- drag threshold and native adapter invocation
- visible voicing source
- 1024x720 and 1920x1080 layouts

Playwright mocks only the Tauri boundary. It does not claim that an external
DAW accepted the OS drag.

## Native boundary

Rust unit/integration coverage verifies compilation and the token lifecycle.
The native command accepts only a prepared token. Before `DoDragDrop`, it
rechecks expiry, cache parent, `.mid` extension, regular-file status, nonzero
size, expected size, and SHA-256.

## Manual gate

Because Phase 5.14 adds a native bridge to Loop Vault, one real FL Studio smoke
test is still required before declaring the DAW acceptance path manually
verified.

