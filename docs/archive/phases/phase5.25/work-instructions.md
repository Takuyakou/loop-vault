# P5.25 Work Instructions — Source Bassline Practice Window Expansion

## Mission

Allow Source Bassline Practice to use a requested window of 1, 2, 4, or 8 bars
without unrelated UI, analysis, or persistence work.

## Scope

- derive a practice target from the immutable source snapshot
- requested bars `1 | 2 | 4 | 8`, default 2, actual partial bars 1..8
- identical window facts across L1/L2/L3 and crop-before-projection
- accessible segmented selector
- preflight the existing Record duration cap without changing it
- compatible optional Practice preference and History validation expansion
- preserve snapshot/Vault persistent schemas, all file versions, and existing
  1/2 records while allowing the locked compatible Practice v2 evolution

## Non-goals

- snapshot/Vault persistent schema changes, any file-version change, or migration
- incompatible Practice schema changes; same-v2 compatible evolution for the
  optional preference and History validation widening is explicitly allowed
- modification of saved progression BPM
- 12-bar practice, new modes, scoring, or source regeneration
- Record cap, L1/L2, Transfer, Analyzer, Harmonic Core, or MIDI Exporter changes
- unrelated refactoring or visual redesign
- merge, push, tag, release, P5.26, or automatic stage advancement

## 1. Start-up Audit

Verify branch, HEAD, master, origin relation, status, worktrees, staged files,
merge/rebase/cherry-pick, P5.22 ancestry, source code, output hygiene, and
Vault/Practice versions. Git is authoritative. Never reset, stash, or discard.

Expected branch: `feat/p525-source-bassline-window-expansion`.

## 2. Audited Current State

- Capture accepts complete 4/4 candidate ranges from 1 through 12 bars.
- Extraction clips/rebases the full chosen range; Vault only clones it.
- The two-bar ceiling is in practice types/validation, UI, History, repository,
  and tests. Current practice/UI default is 1.
- Window preference is not persisted.
- Existing slice is half-open and runs before L1/L2 projection.
- Source changes reset target state; History reopen checks exact source/signature.
- Record Keep rejects only durations greater than 60,000 ms. Record start has no
  duration preflight.

Contradictory later evidence is a stop condition.

## 3. Window Domain and Preference

- Requested: `1 | 2 | 4 | 8`.
- Default: `2`.
- Actual: every integer 1..8.
- Preserve existing History values 1/2.
- Add at most one optional Practice settings field. Absence means 2 in memory;
  do not rewrite storage merely because it is absent.
- Canonical field:
  `sourceBasslineWindowBars?: 1 | 2 | 4 | 8`.
- Parse absence as 2, preserve existing valid 1/2, and reject invalid values.
- Loading alone never patches disk. Patch only after explicit user selection.
- A settings save failure rolls the visible selection back and shows a notice.
- Preference writes carry a monotonically increasing generation. Only failure
  for the still-current selection may roll back. Stale success/failure must not
  overwrite newer visible or persisted intent.
- Keep Practice file version 2.

## 4. Window Slicing

For `[windowStart, windowEnd)`:

```text
croppedStart = max(note.start, windowStart)
croppedEnd   = min(note.end, windowEnd)
```

Keep only `croppedEnd > croppedStart`, rebase relative to `windowStart`, and
preserve pitch/velocity. Never quantize, round, mutate, or replace the snapshot.
Required order: source -> crop -> projection.

## 5. Partial Windows and Lifecycle

On initial selection and source change, preserve requested and reset `startBar`
to 1. Navigation is non-overlapping and locked to:

```text
startBar = 1 + k * requestedBars
endBar = min(startBar + requestedBars - 1, totalBars)
actualBars = endBar - startBar + 1
           = min(requestedBars, totalBars - startBar + 1)
```

`k` is a nonnegative integer and every materialized window requires
`startBar <= totalBars`. Previous is unavailable at `k = 0`; Next is
unavailable when `startBar + requestedBars > totalBars`.

Do not clamp the next start backward to force a full window; that would overlap
the prior window and make History facts ambiguous. Requested 4/8 can yield actual
3/5/6/7; never replace selected requested with partial actual. Persist/reopen the
exact requested/start/actual facts.

Cover Generated/Preset/Vault/Source changes, restart, History reopen,
missing/deleted source, rapid source/level/window changes, and play/stop/replay.

## 6. Record and Compare

Keep `MAX_TAKE_DURATION_MS = 60000`.

```text
durationMs = actualBars * 4 * 60000 / effectiveBpm
recordEligible = durationMs <= 60000
```

Count-in is excluded; exactly 60 seconds is eligible. Over-limit new recording is
disabled before start and defensively rejected with a factual reason; it never
starts. Practice, Listen, Play, previously retained takes and their panel, and
History remain available. The existing Keep cap remains a defensive backstop.

## 7. History and Persistent Compatibility

- Keep History schema v1 and record shape.
- Requested validates 1/2/4/8; actual validates integer 1..8.
- Do not duplicate source note arrays in History.
- Resolve exact logical source and snapshot signature.
- Keep snapshot schema v1, Vault fileVersion 2, Practice fileVersion 2.
- No migration solely for P5.25.

## 8. UI and Accessibility

Reuse the Bass Practice visual system. Present `[1] [2] [4] [8]` as one
segmented button group with localized group name, native keyboard activation,
`aria-pressed`, visible focus, selected/disabled contrast, and factual disabled
reasons. Verify 320 px and 200% without overflow or hidden controls.

## 9. Regression Matrix

| Area | Required cases |
| --- | --- |
| Domain | requested 1/2/4/8; default 2; actual 1..8; invalid values |
| Crop | exact/crossing/full/no overlap; rebase; pitch/velocity; immutable; deterministic |
| Levels | every size L3 exact; L2/L1 crop-before-projection; shared facts |
| Partial | 8->1..8; 4->1..4; requested retained |
| Legacy | existing 1/2 output/History; absent setting -> 2 without rewrite |
| Lifecycle | source switch; 8->short; restart; missing source; rapid changes |
| Playback | full/partial play-stop-replay; Record-ineligible still plays |
| Record | below, exact, over; count-in excluded; defensive rejection; retained safe |
| History | v1 round-trip; actual3/5/6/7; exact source/signature; no notes |
| UI/a11y | pointer; keyboard; focus; pressed; group; reason; 320 px; 200% |
| Protected | snapshot/Vault/Practice versions; Analyzer/Harmonic/Exporter untouched |
| Preference | domain/type/default; parse round-trip; absent no rewrite; explicit patch; invalid reject; save rollback/notice |
| Navigation bounds | nonnegative k; start<=total; Previous off at k=0; Next off after final window; no overlap clamp |
| Async preference | rapid 4->8 with success/failure completion in both orders; stale result cannot override newer intent |

## 10. Gate Policy

Intermediate stages use Tier 1/2 focused and relevant regressions. Full Vitest,
relevant-full Playwright, web/Tauri builds when required, security, dependency,
and output hygiene are consolidated in P5.25-03. A docs-only closure may reuse a
heavy result only if production candidate commit is unchanged and documented.
Phase-specific safety gates are never skipped.

P5.25-01 owns preference domain/type/default/parser behavior. P5.25-02 owns UI
selection, explicit persistence patching, generation-safe save-failure
rollback/notice, and repository round-trip/no-load-rewrite integration. Final
protected-path review must record zero Cargo/Rust diff and zero unrelated
protected-surface diff.

Before commit, review status, staged name-status, staged diff, and diff-check;
stage verified explicit paths only. Record the exact commit and post-commit state.

## Stop Conditions

Stop without discarding work if implementation requires stored snapshot changes,
a Vault/Practice version bump, Record cap increase, L1/L2 or Transfer redesign,
or causes an existing 1/2 regression.

## Definition of Done

- locked window, crop, lifecycle, Record, History, UI, and a11y contracts pass
- snapshot is immutable; snapshot/Vault schemas and all file versions remain
  unchanged while the locked compatible Practice v2 evolution is honored
- focused/relevant gates pass per stage and Tier 3 gates pass at final candidate
- privacy, security, dependency, generated-output, Cargo diff, and diff-check
  gates pass where applicable
- reports/state name exact tested commits; each stage is independently committed
- final status is `READY FOR PRODUCT ACCEPTANCE — Source Bassline Practice Window Expansion`
- final worktree is clean; merge/push/tag/release/P5.26 remain unperformed
