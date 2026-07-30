# Phase 5.13 Repository Audit

## Scope and baseline

- Audit branch: `docs/p513-00-ui-audit`
- Baseline commit: `f368e80e473be318c643bf2adecd735ec2cf24b5`
- Application stack: React 18, TypeScript, Vite 7, Zustand 5, Tauri v2
- UI entry points: `src/App.tsx`, `src/components/AppShell.tsx`
- Main screens: `src/views/HomeView.tsx`, `src/views/CaptureView.tsx`, `src/views/VaultView.tsx`, `src/views/DetailView.tsx`, `src/views/ProgressionDetailView.tsx`, `src/views/PracticeView.tsx`, `src/views/SettingsDialog.tsx`
- Global styles: `src/styles.css`, `src/styles/tokens.css`
- Domain boundary: `src/domain/**`
- Tauri boundary: `src-tauri/**`, `src/storage/tauriVaultStorage.ts`

No analyzer, schema, Rust command, persistence format, or domain behavior was changed in this audit stage.

## Repository state

| Check | Result |
| --- | --- |
| Phase 5.12 on `main` | PASS |
| `fileVersion` | `1` |
| Default analyzer | `phase4-v1` |
| Tracked MIDI files | `0` |
| Tracked `.local-evaluation` files | `0` |
| Existing untracked local folders | `.agents/`, `.claude/` (untouched) |
| TypeScript tests | 236 files / 1,835 tests passed |
| Rust tests | 24 passed |
| lint | PASS |
| typecheck | PASS |
| Web build | PASS |
| Tauri build | PASS |

## Layering

`src/domain/**` remains independent of React, Zustand, and Tauri. UI state and orchestration live in views/components and `src/App.tsx`; persistent state is accessed through the Zustand store and repository adapters. Phase 5.13 must not move presentation concerns into the domain layer.

## UI architecture observations

- `src/App.tsx` owns navigation, global dialogs, toast text, close guards, save status, and top-level integration.
- `src/components/AppShell.tsx` owns primary navigation, global preview sound, master volume, Live MIDI, settings, playback stop, and save status.
- `src/views/CaptureView.tsx` (about 2,840 lines) and `src/views/PracticeView.tsx` (about 3,102 lines) are the largest UI ownership surfaces.
- Modal behavior is centralized in `src/components/Modal.tsx` and already includes focus trap, Escape close, stacked-modal handling, body scroll locking, and focus return.
- Shared visual contracts are partial. Buttons use both `lv-button-*` classes and many one-off Tailwind class strings. Panel, field, badge, status, and empty-state patterns are often declared locally.
- Existing semantic tokens cover the core dark palette, spacing 1/2/3/4/6, and two radii, but do not yet cover danger/success/focus, control height, typography, shadow, motion, or z-index.

## Build baseline

Production Web build:

- CSS: 44.39 kB, 9.37 kB gzip
- JavaScript: 1,316.76 kB, 383.30 kB gzip
- Warning: the main JavaScript chunk exceeds Vite's 500 kB advisory threshold

Tauri artifacts:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## Protected surfaces

The following are baseline-locked for Phase 5.13:

- `src/domain/schema.ts`
- `src/domain/midi/analysis.ts`
- `src/domain/midi/**` analyzer behavior
- Vault persistence and `fileVersion = 1`
- Live MIDI judgment
- Chord Dojo judgment
- MIDI playback musical behavior
- Phase 5.12 Voice extraction, role assignment, and preset semantics

