# Phase 5.13-3 Live MIDI Window Report

## Root cause

Phase 5.13 v2 did not create a Live MIDI window. `src/App.tsx` changed `liveMidiMode`
and replaced the entire App Shell with `LiveMidiMiniMode`, while
`src/liveMidi/miniWindowController.ts` resized `getCurrentWindow()`. The current
window was the main window, so opening Live MIDI made the main application appear
to disappear.

## Implemented lifecycle

- The main window creates one `WebviewWindow` with label `live-midi`.
- A second open request finds the existing label, restores it when minimized,
  shows it when hidden, and focuses it.
- The main JavaScript context is the only owner of `defaultLiveMidiStore`,
  `liveMidiService`, the MIDI input, and chord analysis.
- The Live MIDI webview receives a serializable snapshot and sends typed commands
  to the main window. It never calls `activate()` and cannot open a second device.
- `メイン画面を表示` restores/shows/focuses main without closing Live MIDI.
- The Live MIDI close request is routed to main. Main releases the device,
  remembers the mini bounds, destroys only the mini window, and keeps main alive.
- Main close continues through the existing Vault close guard, stops playback and
  `liveMidiService`, then invokes `exit_app`; Tauri exits every app window.
- Saved bounds are clamped into an available monitor work area. Minimum size is
  320x200; default size is 420x260.
- Existing `alwaysOnTop` preference is preserved. No new always-on-top behavior
  or setting was introduced.

## Synchronised state

The window protocol in `src/liveMidi/windowProtocol.ts` carries devices, selected
input, connection status, error, current/provisional/confirmed chord, history,
history visibility, and UI language. Store methods, note-state Maps, and
repository data do not cross the boundary.

## Verification

- Window manager harness: single-instance focus plus 50 concurrent
  open/focus/close cycles passed.
- Serializable snapshot boundary test passed.
- React StrictMode asynchronous listener cleanup is guarded both before and after
  listener registration resolves.
- Existing Live MIDI detector, stabilizer, latency benchmark, history import, and
  service tests passed in the 1,854-test Vitest run.
- Tauri production build accepted the `live-midi` capability and generated the
  Windows executable, MSI, and NSIS installer.

## Constraint

Native multi-window visual automation is not available in this repository.
The lifecycle is verified by the adapter-driven Tauri window-manager harness and
the production Tauri build; the browser screenshot is only visual evidence of the
main and mini surfaces coexisting, not a claim that Chromium created a native
Tauri window.
