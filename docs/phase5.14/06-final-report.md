# Phase 5.14 Final Report

## Scope

Phase 5.14 adds deterministic saved-progression MIDI export, normal file save,
and Windows native DAW drag-out. It does not change MIDI analysis, candidate
selection, saved-data schema, or `fileVersion`.

## Stacked work

| Stage | Branch | PR |
|---|---|---:|
| P5.14-00 audit | `docs/p514-00-audit` | #344 |
| P5.14-01 domain | `feature/p514-01-midi-export-domain` | #345 |
| P5.14-02 save/cache | `feature/p514-02-midi-file-cache` | #346 |
| P5.14-03 native drag | `feature/p514-03-native-daw-drag` | #347 |
| P5.14-04 UI | `feature/p514-04-progression-midi-ui` | #348 |
| P5.14-05 release gates | `test/p514-05-roundtrip-release-gates` | pending |

Dependency order is #344 -> #345 -> #346 -> #347 -> #348 -> P5.14-05.
All PRs remain unmerged.

## Reuse

The Windows OLE / `CF_HDROP` bridge shape was reused from Chord Drip commit
`7c90159099961122e80dd4514e4a7213f8ee12df`. Loop Vault adds a
content-addressed atomic cache, 24-hour TTL, safe cleanup, and token/path/hash
revalidation. Chord Drip UI and its unsafe broad startup cleanup were not
copied.

## Product result

- Progression Detail remains chord-card first.
- `MIDI` click, keyboard, and context menu save a `.mid`.
- `MIDI` drag starts one native external file drag.
- Current unsaved progression edits are exported without mutating the Vault.
- Voicing source and recoverable failures are visible.
- Home, Practice, and Live MIDI have no new export entry.
- The local rollback key is
  `loop-vault:progression-midi-export-enabled:v1`.

## Round trip

The unchanged Analyzer returned 21/21 timeline items: 19 exact and two
same-root quality ambiguities (`sus2/add9`, `sus4/7sus4`). No exporter event
was missing.

## Compatibility locks

- `defaultAnalyzerMode`: unchanged (`phase4-v1`)
- `fileVersion`: unchanged (`1`)
- Vault schema: unchanged
- protected Analyzer/store/theme blobs: unchanged
- tracked personal MIDI: 0
- tracked `.local-evaluation`: 0

The protected blob hashes still match `00-baseline-lock.json`.

## Verification

| Gate | Result |
|---|---|
| lint | PASS |
| application TypeScript | PASS |
| E2E TypeScript | PASS |
| Vitest | 246 files / 1,886 tests PASS |
| Rust | 30 tests PASS |
| Playwright | 31 tests PASS |
| round trip | 21/21 timeline, 19 exact PASS |
| Web build | PASS, existing large-chunk warning |
| Tauri build | PASS |

## Windows artifacts

Generated on 2026-07-30 from the final Phase 5.14 source tree:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `src-tauri/target/release/loop-vault.exe` | 14,979,584 | `C90B078CE698649D8A49ADDD55E9DBD1EB9B2BE1BED4991153BB16926E2B4643` |
| `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi` | 5,177,344 | `1DBF4E16AA2B321E7E0254D52E3E50DCB8597FF603AEAAC837A0C748E855B025` |
| `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe` | 3,657,624 | `B8D27A6C59EB4899BD5EDDCAFEB0AAF86D0F562FB13AB177197700A5A28DB038` |

Build artifacts are not tracked by Git.

## Feature flag

The release default is ON after all automated gates passed. Setting
`loop-vault:progression-midi-export-enabled:v1` to `false` restores the Phase
5.13 Progression Detail surface without changing saved data.

## Remaining manual check

A real FL Studio drag-and-drop smoke is required because Loop Vault gained a
new native bridge. Automated tests prove byte identity, token safety, UI
gesture routing, and Windows bridge compilation, but cannot prove FL Studio's
external acceptance.

## Out of scope

Phase 5.15 and Phase 5.2 were not started. Analyzer label disambiguation for
suspended chords is a Phase 5.15 candidate.
