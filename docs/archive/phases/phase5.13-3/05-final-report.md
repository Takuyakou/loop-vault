# Loop Vault Phase 5.13-3 Final Report

## Delivered

1. Live MIDI now uses one independent Tauri subwindow while main remains visible.
2. Reopening focuses the existing subwindow; it does not create another analyzer
   or MIDI connection.
3. Mini close releases Live MIDI and preserves main. Main close keeps the existing
   save guard and exits the whole Tauri application.
4. `メイン画面を表示` restores/focuses main without closing Mini.
5. Window bounds restore safely inside an available monitor.
6. Chord Dojo uses one main page scroll plus a bounded queue scroll.
7. Keyboard and mouse can reach the complete bottom at all required viewports.
8. The top bar now permanently shows the requested FL-style two-row level meter
   before the volume knob and piano sound selector.

## Pull-request stack

- #336 `docs/p513-3-00-audit`
- #337 `fix/p513-3-01-live-midi-window`
- #338 `fix/p513-3-02-dojo-scroll`
- #339 `feature/p513-3-03-preview-level-meter`
- #340 `fix/p513-3-04-live-window-hardening`
- #341 `fix/p513-3-05-dojo-viewport`
- #342 `test/p513-3-06-validation`

All PRs are stacked in dependency order. `main` is not merged or rewritten.

## Gates

| Gate | Result |
| --- | --- |
| lint | PASS |
| application typecheck | PASS |
| E2E typecheck | PASS |
| Vitest | PASS, 240 files / 1,854 tests |
| Rust | PASS, 24 tests |
| Playwright | PASS, 30 tests |
| Web build | PASS |
| Tauri build | PASS |
| `git diff --check` | PASS |
| tracked MIDI | 0 |
| tracked `.local-evaluation` | 0 |

Generated Windows artifacts:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## Protected contracts

- `src/domain/schema.ts` blob remains
  `3e8b9a9ef8ba91631899629cdd9d5527045fa836`.
- `src/domain/midi/analysis.ts` blob remains
  `8a05e530dc583950b89ce090c7aba591793c6c03`.
- `src/store/vaultStore.ts` blob remains
  `1d4c33f64abbd5b90e43161efbbe6938b5df9add`.
- `src/styles/tokens.css` blob remains
  `9d6987627638a736f0c493b4b9edc96f487355d0`.
- `defaultAnalyzerMode` remains `phase4-v1`.
- Vault `fileVersion` remains 1.
- Live MIDI detector and latency constants, Dojo match/scoring/voicing, Vault
  payload, and Rust analysis commands were not changed.

## Known limitations

- Normal Playwright cannot control native Tauri windows. Native lifecycle is
  covered by the 50-cycle window-manager harness and production Tauri build,
  while browser Playwright covers visual coexistence and UI semantics.
- The level meter represents deterministic playback activity and master volume;
  it is not a new audio-analyzer peak meter. No Web Audio graph or playback
  timing was changed.
- The existing Vite warning for the JavaScript chunk larger than 500 kB remains.
- Phase 5.14, 5.15, 5.2, MIDI Export, Quick Chord Capture, and analyzer work were
  not started.
