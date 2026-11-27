# P5.30 Work Instructions

## Scope

Deliver the bounded 32-bar / 128-token Text Progression capacity, approved
compact Voicing Loop layout and single-clock playhead, then card audition and a
session-local reference-sound control. Execute and close one stage at a time.

## General execution discipline

Prefer correctness and automated evidence over speed. Spend additional analysis time where it prevents rework, especially around timing, audio lifecycle, long-input limits, and UI layout invariants.

Before every stage:

- inspect existing production code and tests before designing a parallel mechanism;
- reuse existing domain helpers, clock, voicing resolver, playback scheduler, Vault adapters, and UI components where suitable;
- keep the diff small and stage-specific;
- preserve unrelated user work exactly.

## Git safety

- No reset/stash/discard/checkout-over-user-changes.
- No `git add -A` or `git add .`.
- Explicit-path staging only.
- No automatic merge, push, tag, or release.
- Never recreate retired `docs/CURRENT_STATE.md`.
- Build/test side effects must not leave tracked changes.

## Privacy and repository hygiene

Do not add real/private MIDI, audio, recordings, device IDs, Vault titles from the user's live data, `.local-evaluation`, personal absolute paths, generated installers, or build artifacts. Tests must use synthetic/in-repo safe fixtures only.

## Non-goals

Do not add a new practice system, comping/groove generator, arbitrary timing
grammar, analyzer, voicing generator, scoring model, Vault migration, unrelated
Practice redesign, release, merge, or push.

## Stage00 — Audit

Inspect and record:

- current Text Progression hard limits and every place the limits are duplicated;
- Text → Draft → Vault save/reload → Voicing Loop path;
- P5.29 duration/event model and single-clock source;
- current Voicing Loop component hierarchy and layout classes;
- why current/active timeline state could potentially alter dimensions;
- existing full/reference playback, current-chord preview, selected voicing resolver, note scheduling, cleanup, pause/resume/restart, source-switch lifecycle;
- persistence options for a new checkbox, without adding schema solely for it;
- relevant tests and accessibility infrastructure.

No production behavior change in Stage00.

## Stage01 — Text Progression capacity

Implement contracts 02 and 09. Keep grammar the same; expand bounded capacity only. Avoid silent truncation. Add boundary tests and one maximum-envelope end-to-end fixture.

## Stage02 — Compact layout/playhead

Use `$emil-design-eng` if available. Existing Loop Vault visual language and the approved mock override generic design preferences. Implement contract 03/04/08 exactly enough that card geometry never changes when current, auditioned, focused, or played.

## Stage03 — Audio interactions

Reuse the existing resolved-voicing and playback path. Do not create a second voicing generator or independent transport timer. Implement contract 05/06/07. Audio cleanup and no-duplicate-note tests are mandatory.

## Stage04 — Acceptance

Run focused tests first, then the relevant/full regression set described in contract 10. Final status may be `READY FOR PRODUCT ACCEPTANCE` only if all automated gates pass and the worktree is clean. Human visual/audio acceptance remains explicitly separate.

## Definition of Done

The phase is complete only when every stage has its required fresh gates and
commit recorded, P5.29 protected behavior remains intact, phase docs validate,
privacy/generated-output checks pass, and the final worktree is clean. Stop for
human acceptance without merging or pushing.
