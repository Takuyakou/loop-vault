# Contract 01 — Scope, Compatibility, and UI

## Mission

P5.25 changes only Source Bassline Practice window selection from existing
1/2-bar support to requested `1 | 2 | 4 | 8`, default 2.

## Persistent Compatibility

- `SourceBasslineSnapshot.schemaVersion` remains 1.
- Vault `fileVersion` remains 2.
- Practice `fileVersion` remains 2.
- Source Bassline History remains schema v1 and keeps its record shape.
- Existing progression BPM and existing 1/2 History facts are not migrated,
  recomputed, or rewritten.
- The canonical compatible Practice v2 field is
  `sourceBasslineWindowBars?: 1 | 2 | 4 | 8`.
- Absence parses to 2 in memory; existing valid 1/2 values are preserved and
  invalid values are rejected.
- Loading alone never rewrites disk. Only an explicit user selection patches
  settings. Save failure rolls UI selection back and displays a notice.
- Each async write has a monotonic generation. Only a failed selection that is
  still current may roll back. Stale success/failure never overwrites newer
  visible or persisted intent. Rapid 4->8 completion-order cases are required.
- This is compatible same-v2 schema evolution, not a migration or file-version
  change. P5.25-01 owns domain/type/default/parsing; P5.25-02 owns UI patch,
  persistence round-trip/no-rewrite, generation-safe rollback/notice wiring.

## UI Contract

Use the current visual system for an accessible segmented group
`[1] [2] [4] [8]`: localized group name, `aria-pressed`, native keyboard,
visible focus, selected/disabled contrast, factual disabled reason, and no
overflow at 320 px or 200% zoom.

## Protected Surfaces

Do not change snapshot generation/schema, Vault schema/version, Practice
fileVersion, Record maximum, L1/L2 algorithms, Transfer, Analyzer, Harmonic
Core, MIDI Exporter, modes, or scoring. A 12-bar option and P5.26 are out.
