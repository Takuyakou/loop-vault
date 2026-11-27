<!-- phase-id: 5.19 -->
# Contract 07 — Adjustable Root Motion Chain Length

## P5.19-06 scope amendment

The human explicitly approved extending Root Motion Echo from the locked two to
four-note behaviour to a selectable two through eight-note phrase. This
amendment overrides the earlier fixed chain-length wording only; all privacy,
Vault, scoring, and protected-surface contracts remain in force.

- `rootMotionNoteCount` is an additive optional Practice setting with values
  `2..8`. Its legacy/default value is `2`; no Vault schema or Vault mutation is
  introduced.
- Level controls the objective complexity for the **first** root transition:
  direction (L1), category (L2), exact interval (L3), shape (L4), and Transfer
  (L5). It does not change the selected phrase length.
- The full selected phrase is for Listen, Sing, Play, fretboard disclosure,
  Record & Compare target playback, and Transfer rehearsal. This amendment does
  not claim objective scoring for later transitions and does not add automatic
  scoring.
- Each note receives two beats. Valid phrase lengths are therefore 4, 6, 8,
  10, 12, 14, or 16 beats for two through eight notes. Generated and Transfer
  paths must preserve every signed adjacent motion exactly.
- Generated input includes the selected note count in its deterministic seed and
  uses a new generator version. Bounded retry remains 32 and failure remains an
  explicit unavailable state.
- A Vault-derived source must contain at least the selected number of safe chord
  roots. It must fail closed when too short; it must not shorten the request,
  substitute a root, reveal a title, or import an original bassline.
- History retains the full factual motion sequence. Repository validation permits
  up to seven motions while continuing to read legacy one through three-motion
  entries. No raw audio, source path, title, device data, or composite score is
  added.
- The fretboard must make the ordered root sequence legible for longer phrases,
  and changing the count must stop any active preview and replace the session
  safely.

## P5.19-06 gates

- documentation and state validation
- 2..8 deterministic generated, Vault, Transfer, and fingering tests
- legacy and seven-motion Practice History validation
- Root Motion UI, Japanese label, keyboard, narrow viewport, and safe
  unavailable recovery tests
- Bass Practice regression, app/E2E typecheck, lint, production build, and
  `git diff --check`
- protected-surface and privacy checks: P5.15, Vault schema/mutation, Analyzer,
  MIDI Exporter, tracked MIDI, `.local-evaluation`, and personal paths remain 0