<!-- phase-id: 5.25 -->
# Phase 5.25 — Source Bassline Practice Window Expansion

## Status

`P5.25-00 AUDIT / CONTRACT LOCK COMPLETE — PRE-CLOSURE GATES PENDING`

The repository is feasible without changing the stored source snapshot, Vault
schema, or existing saved progression BPM. Stage 00 remains active until its
gates are rerun on the current documentation candidate, recorded, and committed.

## Purpose

Expand Source Bassline Practice from the current 1/2-bar practice window to a
selectable 1/2/4/8-bar window. Capture already stores complete 4/4 source
snapshots from 1 through 12 bars. The current two-bar ceiling belongs to the
practice domain, selector, and History validation, not capture or snapshot.

## Locked Decisions

- Requested window bars are exactly `1 | 2 | 4 | 8`; the new default is `2`.
- Existing History requested/actual 1 or 2 values retain their exact meaning.
- Window preference is not currently persisted. The canonical compatible v2
  field is `sourceBasslineWindowBars?: 1 | 2 | 4 | 8`; absence resolves in
  memory to 2 without immediate rewrite.
- Short sources and source changes preserve requested, reset `startBar` to 1,
  and derive `actualBars = min(requestedBars, totalBars)`. Actual values cover
  1..8, including partial 3/5/6/7.
- Slicing is half-open, clips overlapping notes, rebases time relative to the
  window, preserves pitch and velocity, and never mutates the snapshot.
- Required order is `source -> crop -> projection`; L1/L2/L3 share window facts.
- Record remains capped at 60,000 ms. Eligibility is
  `actualBars * 4 * 60,000 / effectiveBpm <= 60,000`; count-in is excluded and
  exactly 60 seconds is allowed. Over-limit affects Record only.
- History keeps v1 shape, expands requested to 1/2/4/8 and actual to 1..8, stores
  no notes, and continues exact source/snapshot-signature resolution.
- The selector is an accessible existing-style segmented group `[1] [2] [4] [8]`
  with group name, `aria-pressed`, keyboard/focus behavior, disabled reason,
  and no overflow at 320 px or 200% zoom.

## Scope

- deterministic 1/2/4/8 practice windows with default 2
- partial final windows and exact boundary crop/rebase
- one shared window across L1/L2/L3 with crop-before-projection
- source-switch, restart, rapid-switch, History reopen, and playback safety
- Record preflight without increasing the existing cap
- compatible optional Practice preference and History validation expansion
- focused, regression, accessibility, privacy, schema, and final product gates

## Non-goals

- changing `SourceBasslineSnapshot` schema version 1
- changing Vault file version 2 or Practice file version 2
- migrating/recomputing existing saved data or progression BPM
- a 12-bar option, new mode, scoring, or snapshot regeneration
- Record cap, L1/L2, Transfer, Analyzer, Harmonic Core, or MIDI Exporter changes
- P5.26, merge, push, tag, or release

## Core Invariant

```text
SourceBasslineSnapshot (immutable, 1..12 bars)
        |
Practice Window (requested 1/2/4/8; actual 1..8)
        | half-open crop and relative rebase
Level 3 Source Line
        | deterministic projection
Level 2 Chord-tone
Level 1 Root-focused
```

Crop-before-projection is mandatory.

## Required Reading Order

1. root [AGENTS.md](../../AGENTS.md)
2. root [CLAUDE.md](../../CLAUDE.md)
3. this README
4. [execution-state.json](execution-state.json)
5. [work-instructions.md](work-instructions.md)
6. [Contract 01 — Scope](contracts/01-scope-contract.md)
7. [Contract 02 — Window Slicing](contracts/02-window-slicing-contract.md)
8. [Contract 03 — Record / History / Lifecycle](contracts/03-record-history-contract.md)
9. [P5.25-00 repository audit](audit/P5.25-00-repository-audit.md)
10. [active Stage 00 report](reports/P5.25-00-audit-baseline.md)

Git reality outranks this package.

## Stages

### P5.25-00 Audit / Baseline / Contract Lock

Audit and contracts are locked. Current-docs gates and the independent docs-only
commit remain pending. Production code must not change.

### P5.25-01 Domain / Window Expansion

Implement domain/type/default, slicing, partial-window, projection-order, and
preference parsing rules after Stage 00 closes.

### P5.25-02 UI / Record / History Integration

Implement selector, user-selection settings patch/rollback wiring, lifecycle,
Record-only eligibility, and History compatibility.

### P5.25-03 Hardening / Product Acceptance

Run consolidated Tier 3 gates and stop at human product acceptance.

## Completion

- 1/2/4/8 selectable, default 2, correct full/partial L1/L2/L3 targets
- half-open crop, relative rebase, immutability, crop-before-projection verified
- explicit 1/2 selection keeps equivalent crop, navigation, and History
  semantics; only absent preference/default behavior changes from 1 to 2
- source/window/level/playback transitions leave no stale state
- exact/over-limit Record behavior is safe and practice remains usable
- selector is accessible at 320 px and 200% zoom
- persistent versions unchanged and all final gates pass

## Next Action

Rerun P5.25-00 gates on this documentation candidate, record results and the
Stage 00 commit, then stop. Do not begin P5.25-01 automatically.
