# Phase 5.13-3 Playwright and Integration Report

## Playwright

Command:

```text
npm run test:e2e:update
```

Result: 30 passed, 0 failed.

Coverage included:

- Home, Capture, pre-analysis, analysis results, correction editor.
- Vault save/search/detail/Practice flow.
- Keyboard-only navigation and dialogs.
- Axe-based accessibility routes.
- 1024x720 responsive flow and the 1024/1280/1366/1440/1920 matrix.
- Reduced motion.
- Phase 5.13-3 PageDown, End, queue wheel chaining, bottom visibility, and
  horizontal-overflow assertions.
- Persistent top-bar level meter in idle state.
- Main content remaining visible while the browser fallback Live MIDI surface is
  open.

## Tauri window-manager integration

`src/liveMidi/miniWindowController.test.ts` is the required window-manager
harness for lifecycle behavior that normal browser Playwright cannot control.
It verifies:

- concurrent open requests create one window;
- an existing window is focused instead of duplicated;
- showing main does not destroy Live MIDI;
- 50 open/focus/close cycles create and destroy exactly 50 instances;
- off-screen saved bounds are recovered;
- minimum bounds are maintained.

The Tauri production build validates the real `WebviewWindow` API and capability
set. Native window pixels/focus were not inspected through WinAppDriver because
that driver is not part of this repository.

## Test totals

- Vitest: 240 files, 1,854 tests passed.
- Rust: 24 tests passed.
- Playwright: 30 tests passed.
- TypeScript application and E2E typechecks: passed.
