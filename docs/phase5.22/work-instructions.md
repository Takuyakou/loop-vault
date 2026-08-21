<!-- phase-id: 5.22 -->

# Phase 5.22 Work Instructions
# Source Bassline Practice — B+

## 0. Mission

選択されたBass Voiceの実演奏note eventsを、
practice用加工データではなくdetached source assetとして保存し、
Bassline Echoで段階的に練習できるようにする。

## Scope

Phase scopeは[READMEのIn scope](README.md#in-scope)とContract 01に従う。P5.22-00は監査・契約・baselineだけで、production featureは変更しない。

## Non-goals

[READMEのNon-goals](README.md#non-goals)を正本とし、新Practice mode、raw MIDI保存、自動採点、Analyzer変更、P5.23は含めない。

---

# 1. Start-up audit

確認:

- branch / HEAD / master
- `git status --short`
- worktrees
- merge/rebase/cherry-pick
- P1 Security Hardening ancestor
- P5.21.1 accepted ancestor
- P5.20/current Capture path
- P5.15 ancestry
- `docs/CURRENT_STATE.md` absent
- test-output hygiene

cleanでなければreset/stash/discardせず停止。

---

# 2. Required repository audit

## 2.1 MIDI / Voice

- normalized note type
- Voice identity
- user role override
- multiple bass Voices
- note overlap/polyphony
- velocity range
- PPQ/tick/beat conversion
- source section/block range

## 2.2 Save boundary

- CaptureDraft
- SavedProgressionBlock
- createIdeaFromDraft / append
- duplicate block
- edit block
- delete block
- export/import
- backup/recovery/quarantine

## 2.3 Versioning

- current Vault `fileVersion`
- Zod unknown-key policy
- current app load→save behavior
- previous v1.1.0 app load→save behavior if reproducible in isolated worktree
- future-version readonly path
- migration framework

## 2.4 Practice

- Bassline Echo source union
- target event/polyphony model
- Level 1〜3 generator contracts
- section/window selector
- Transfer semantics
- Record & Compare
- History

---

# 3. SourceBasslineSnapshot contract

Persistent name follows repository conventions. Conceptual shape:

```ts
sourceBassline?: {
  schemaVersion: 1;
  sourceKind: "selected-bass-voice";
  capturedMeter: { numerator: 4; denominator: 4 };
  length: ExactBeat;
  notes: Array<{
    pitch: number;
    start: ExactBeat;
    duration: ExactBeat;
    velocity: number;
    continuesFromBefore: boolean;
    continuesAfterEnd: boolean;
  }>;
  capturedHarmony?: {
    schemaVersion: 1;
    spans: Array<{
      start: ExactBeat;
      duration: ExactBeat;
      rootPitchClass: number;
      bassPitchClass: number | null;
      allowedPitchClasses: number[];
    }>;
    signature: string;
  };
  snapshotSignature: string;
}
```

This is conceptual, not a forced type name.

## Required musical fields

- pitch
- onset relative to the authoritative captured range
- duration clipped to that range
- velocity
- mandatory boundary continuation facts
- meter/length sufficient to interpret timing
- independent snapshot and captured-harmony signatures

## Forbidden fields

- source path / filename
- track/Voice display name or persisted Voice id/index
- device identifier
- raw MIDI bytes
- private title/memo
- Analyzer confidence or arbitrary source metadata

The `sourceBassline` subtree is strict. A forbidden or unknown key is rejected, not stripped.

## Preserve all notes

Do not collapse simultaneous bass notes at persistence time. Source snapshot is the original material. Practice projection may be monophonic, but source remains complete.

## Deterministic order and signatures

Canonical note order is `start`, `pitch`, `duration`, `velocity`, `continuesFromBefore`, then `continuesAfterEnd`. A transient raw event index may break otherwise identical ties but is never persisted.

Canonical harmony order is `start`, `duration`, `rootPitchClass`, nullable `bassPitchClass`, then lexicographically sorted unique `allowedPitchClasses`.

- `snapshotSignature`: lowercase SHA-256 of canonical UTF-8 JSON for schema/source/meter/length, canonical notes, and canonical captured-harmony payload or explicit `null`, excluding both signature fields.
- `capturedHarmony.signature`: lowercase SHA-256 of canonical UTF-8 JSON for exactly `{ schemaVersion: 1, spans: orderedSpans }`, excluding `signature`.

JSON property order and rational normalization are fixed by the serializer; runtime object insertion order is not an authority.

---

# 4. Section boundary semantics

Only sound intersecting one authoritative source-matched range is eligible.

P5.22 adopts option A: store the exact half-open intersection `[rangeStartTick, rangeEndTick)` and make `continuesFromBefore` / `continuesAfterEnd` mandatory booleans. Persisted starts are relative to the range. A note ending exactly at range start or starting exactly at range end does not intersect.

Do not invent an onset at section start. Do not quantize. The authoritative range must be an explicit 1..12 bar, constant 4/4, bar-aligned exact tick range from the same MIDI source as the selected Bass Voice. Chord-coverage-derived persisted `sourceStartBeat` / `sourceEndBeat` fields are not range authority.

Automatic and manual ranges are both eligible only when they belong to the selected Voice source and have proven raw-tick boundaries, constant 4/4, exact bar alignment, and 1..12 complete bars. Arbitrary/unprovable manual ranges, changing meter, or multi-source selections without one provable source-matched exact range remain progression-saveable but snapshot-ineligible.

Boundary tests:

- starts before / ends inside
- starts inside / ends after
- spans whole section
- exact boundary onset/off
- simultaneous boundary events
- source/range mismatch

---

# 5. Timing precision

JavaScript beat floats and `PreAnalysisNote.startBeat` / `durationBeats` are not exact source timing and must not be reverse-converted with `Math.round` or any denominator guess.

Stage01 must add a transient, privacy-safe extraction path from the raw parser/source that carries integer `startTick`, `durationTick`, source `ticksPerQuarter`, and the exact source-matched range boundaries. `ExactBeat = { numerator, denominator }` is derived directly from those integers, reduced canonically, with zero as `0/1`, a positive denominator, and BigInt arithmetic/comparison.

Source-note exactness and captured-harmony exactness are separate. If exact source notes/range cannot be proven, no snapshot is attached. If source notes are exact but exact harmonic spans cannot be proven, persist the all-note snapshot with `capturedHarmony` omitted: Level3 remains available, while L1/L2 and source Chord Context are unavailable with a localized reason. No quantized fallback is allowed.

Requirements:

- deterministic serialization
- no cumulative drift
- finite bounded inputs
- no negative or zero note duration
- no hidden rounding/quantization
- downstream playback conversion tested

---

# 6. Versioning decision

Vault uses `fileVersion = 2`. Current v1 strict schemas quarantine an idea containing an unknown block field and an old writable v1 round-trip can lose enhanced data. The new app keeps the same physical Vault key/path, migrates v1 to v2 deterministically, and treats versions above 2 as readonly/non-write in the TypeScript parse/store path.

The supported old Vault path is TypeScript `parseVaultFileJson` plus the Vault store. It detects v2 as a future version, exposes readonly/recovery behavior, refuses writable save, and leaves stored data unchanged. Vault compatibility must be tested through this TypeScript path; Rust `validate_document` belongs to Practice storage and is not the Vault authority.

Practice History also uses fileVersion 2 on the same existing physical Practice key/path. Current old Rust/TypeScript validators accept exactly v1, so an old app safely rejects v2 before write. The new app migrates v1 to v2 and applies the same >2 readonly/non-write rule consistently in Rust and TypeScript.

Required compatibility tests:

- v1 -> v2 deterministic migration
- current v2 round-trip
- supported old Vault TypeScript path treats v2 as future readonly/non-write
- supported old Practice Rust+TypeScript path rejects v2 without mutation
- Vault TypeScript and Practice Rust+TypeScript reject >2 writes
- export/import and backup/recovery
- no data loss or silent downgrade

---

# 7. Budgets and validation

Contract06 length is not a sufficient size budget.

Locked bounds:

- max 8,192 notes per snapshot
- max 1,048,576 UTF-8 bytes for canonical serialized snapshot
- zero or one snapshot per progression block
- max 16,777,216 UTF-8 bytes for the complete serialized Vault document at local save, export, import, migration, and merge preflight
- finite-number, pitch, velocity, timing/end, signature, and deterministic-order rules

The existing P1 16 MiB check is import-only today; Stage02 must add operation-wide preflight without weakening P1. Any over-limit operation fails before write and preserves the previous document. A second snapshot-free confirmation appears only when opt-in is ON and the requested snapshot cannot be attached; opt-in OFF uses ordinary save with no extra confirmation. Requested data is never silently omitted.

A structurally valid legacy v1 Vault already above 16 MiB enters localized size-recovery readonly mode, not quarantine or automatic rewrite. Add, duplicate, import, merge, and export are blocked. Only delete/shrink operations whose full canonical migrated v2 result is at or below 16 MiB may atomically commit; otherwise the legacy file remains unchanged.

The 8,192-note and 1 MiB canonical UTF-8 caps are independent security ceilings. With the current canonical note format, the byte cap binds first: exact-byte fixtures prove acceptance at 1,048,576 bytes and rejection at +1, while 8,191/8,192 minimally encoded notes exceed the byte budget and 8,193 is rejected by the note-count guard before sorting. The note cap is still 3.2768% of the 250,000-note MIDI intake cap (about 1/30.52), but that ratio is not a persisted density claim. The 1 MiB snapshot cap is 1/16 of the aggregate Vault cap. No private corpus or empirical distribution is currently available, so only synthetic/security-derived claims are made. Optional privacy-safe aggregate evidence may be added later without recording paths, titles, labels, or note dumps.

Required tests:

- below limit / exact limit / over limit
- aggregate Vault save/export/import/migration/merge boundaries
- prior document unchanged on denial
- malformed external JSON rejected before write
- NaN/Infinity, huge arrays, invalid pitch/velocity, event beyond range
- snapshot-free fallback only for an ON/requested snapshot that cannot attach; OFF saves normally

Fail closed with a user-safe reason.

---

# 8. Capture UX / Voice selection

## Eligibility

Only included, non-drum, non-duplicate Voices whose effective user-confirmed role is `bass` are candidates. `autoRole` is evidence only.

Candidate selection is explicit: no candidate is silently preselected or confirmed. The save toggle is disabled until the user chooses a Voice, and defaults OFF after selection.

## Multiple bass Voices

P5.22 v1 stores one selected Bass Voice per progression block.

UI:

```text
元ベースライン候補
[ 選択してください ▼ ]

[ ] 元ベースラインを練習用に保存
    4小節 / 48 notes / exportに含まれます
```

- Voice id/index exists only in transient UI/extraction state; persistence receives only a validated detached snapshot.
- A privacy-safe live track label may be displayed, but is never persisted.
- candidate, source, authoritative range, inclusion, duplicate state, effective role, or analysis-result changes clear selection/confirmation and reset opt-in OFF.
- successful progression save also resets opt-in OFF.
- extraction must verify the selected Voice still belongs to the selected source/range.

## No notes / unsupported / over budget

- snapshot creation fails with a clear reason
- opt-in OFF uses the ordinary save path with no extra confirmation
- opt-in ON requires an explicit second snapshot-free confirmation when the requested asset cannot attach

---

# 9. Immutable asset semantics

After save, source snapshot and captured harmony are immutable. Any block edit attempt containing `sourceBassline` or nested source fields is rejected; ordinary progression edits preserve the existing object byte-for-byte.

Captured harmony is built only at initial save from the user-confirmed progression aligned to the authoritative source range. Authority is the repository `chordPitchClasses(symbol)` function plus explicit slash-bass pitch class. Spans are clipped relative to the captured range and use exact timing.

Rules:

- gaps are allowed, but any projected onset in a gap makes L1/L2 unavailable
- overlapping spans with different canonical harmony payloads are invalid and disable L1/L2/source Chord Context
- exact duplicate overlaps canonicalize deterministically
- active spans use half-open `[start,end)`; boundary onsets select the next span
- current-progression comparison is `match`, `mismatch`, or `unavailable`, using the same canonical harmony payload/signature process

If source notes/range are exact but lossless captured spans cannot be produced, save the all-note snapshot with `capturedHarmony` omitted. Level3 remains available; L1/L2 and source Chord Context are unavailable. Do not discard an otherwise valid snapshot merely because harmony is unavailable.

Level3 depends only on valid source notes and remains available after a later chord mismatch. L1/L2 and source Chord Context use captured harmony, never edited current chords as an implicit replacement.

## Duplicate/delete

- duplicate deep-clones the embedded snapshot and captured harmony, preserving signatures
- delete removes the embedded asset with the block
- History keeps facts only; after deletion replay is unavailable and no substitute is chosen

---

# 10. Progression Detail

Show factual state:

- 元ベースライン: 保存済み / なし / 利用不可
- bars / note count
- simultaneous-note and projection-clip counts when relevant
- captured/current progression `match` / `mismatch` / `unavailable`
- export inclusion disclosure

Do not show original filename, path, persisted Voice id, or track name. No raw-note editor in P5.22.

---

# 11. Bassline Echo integration

Do not add a new Practice mode. The source selector gains `元ベースライン`, enabled only for a valid snapshot.

## Practice windows

- choices: 1 bar or 2 bars
- exact crop `[windowStart, windowEnd)` is applied to the all-note snapshot first; crossing notes are clipped with truthful continuation facts
- deterministic monophonic projection runs after crop
- final partial window is permitted and labelled with its actual bar range; it is never padded or wrapped
- an empty window shows an explicit no-notes reason and cannot start playback
- previous/next are disabled at first/last valid window and expose the reason accessibly
- window/source/level/route/tab changes and Stop cancel schedulers, stop voices, clear timers, and reset phase state

`Transfer` keeps its existing meaning. Source Bassline Transfer is unavailable in v1 with a factual reason; it is not repurposed as window navigation.

---

# 12. Level 3 — Source line

Implement before Level1/2. The current target contract is monophonic/non-overlapping, so Level3 creates a deterministic practice-time projection after exact window crop.

Required:

- snapshot stays all-note
- label: `元ライン（単音化）`
- disclose omitted simultaneous notes and overlap/duration clips
- group exact onsets; choose lowest pitch, then longer clipped duration, then higher velocity, then canonical order
- clip a chosen event at the next chosen onset; omit any zero-duration result
- no claim that projection equals the full original performance

---

# 13. Level 1 / Level 2 derivation

Store neither result. Both derive deterministically from the cropped Level3 projection plus exact captured harmony. If exact/lossless captured harmony is absent, invalid, or ambiguous, both levels are unavailable rather than quantized or guessed.

## Level 1

Label: `ルート中心の簡略版`

- preserve projected onsets/durations
- for each onset, use the active captured span
- map to nearest playable chord root in MIDI 28..55; equal-distance ties choose lower

## Level 2

Label: `コードトーン簡略版`

- preserve projected onsets/durations
- use active captured `allowedPitchClasses`
- keep an already legal playable note; otherwise map to nearest legal pitch in MIDI 28..55; equal-distance ties choose lower
- any onset gap/conflict makes the whole derived level unavailable

## Difference summary

Display factual counts: source/cropped/projected notes, simultaneous groups omitted, overlaps clipped, and pitches replaced. No AI skeleton claim.

---

# 14. Chord Context / Record & Compare

Reuse existing systems.

- source Chord Context uses only valid captured harmony
- current edited progression is used only for the visible match/mismatch/unavailable comparison
- missing/conflicting captured spans disable accompaniment with reason
- Record & Compare reuses existing recorder/store; no binary store or scoring
- target/take playback remains exclusive and all lifecycle cleanup rules apply

---

# 15. Practice History

Do not duplicate source notes or captured-harmony spans.

History may store only:

- source kind `source-bassline`
- logical idea/block reference
- source schema version plus `snapshotSignature` and captured-harmony signature when present
- window bar range and actual partial length
- Level 1/2/3 and monophonic-projection facts/counts
- self review and optional retained-take opaque ID

After source deletion, the row remains readable, replay is unavailable, and no alternate source is substituted. No filename/path/title/Voice id/raw note array.

---

# 16. Export / Import / Privacy

Vault export includes `sourceBassline` because it is a user asset; Capture discloses this before opt-in.

The new subtree schema is strict. Import validates version, per-snapshot note/byte budgets, whole-Vault UTF-8 budget, exact timing/range/order, both signatures, and forbidden-key absence.

- any invalid external snapshot rejects the entire import before write; no partial strip or merge
- local corrupt persisted data follows the existing quarantine/recovery path
- save/export/import/migration/merge over aggregate budget is denied before write and preserves prior data
- negative privacy claims are scoped to the new subtree; legacy outer Vault fields remain governed by existing contracts

Subtree negative tests cover path, filename, track/Voice name or id, device id, raw MIDI, private title/memo, analyzer metadata, and unknown keys.

---

# 17. Stage instructions

## P5.22-00 — Audit / B+ Contract / Baseline

No production feature. Lock file/version compatibility, raw integer timing path, source/range authority, snapshot/harmony schemas and signatures, boundaries, per-snapshot/aggregate budgets, explicit Capture lifecycle, immutable operations, Level policies, History/import/privacy, accessibility, fixtures, and acceptance. Run only Stage00 gates, then stop.

## P5.22-01 — Snapshot / Extraction / Compatibility

Implement pure/domain foundations only:

- transient raw-parser integer `startTick` / `durationTick` / `ticksPerQuarter` extraction seam
- exact source-matched range authority and rational conversion
- all-note boundary clipping/ordering
- captured harmony construction from `chordPitchClasses` plus slash bass
- canonical serializers and independent SHA-256 signatures
- Vault TypeScript v1→v2 migration/>2 readonly and separate same-key Practice Rust+TypeScript v1→v2/>2 non-write
- per-snapshot validation/budgets and synthetic/property fixtures

Do not implement Capture UX or Practice UI.

## P5.22-02 — Capture / Persistence / Vault

Implement explicit Voice selection and OFF-by-default opt-in, invalidation/reset lifecycle, detached validated save adapter, immutable edit rejection, duplicate deep-copy/delete, strict import/quarantine, operation-wide 16 MiB preflight, export disclosure, explicit snapshot-free fallback, and Progression Detail facts.

## P5.22-03 — Bassline Echo / Level3 / Window

Implement source availability, exact crop-before-projection, 1/2-bar windows including empty/final partial behavior, disabled navigation reasons, Level3 monophonic disclosure, playback cleanup, source Chord Context availability, and Record & Compare reuse. Transfer remains unchanged/unavailable with reason.

## P5.22-04 — L1/L2 / History / Lifecycle

Implement deterministic captured-harmony L1/L2 or factual unavailability, difference facts, History v2 facts without note duplication, restart/import/delete/mismatch behavior, and JA/EN/accessibility/responsive coverage.

## P5.22-05 — Hardening / Release / Acceptance

Run full gates and build artifacts. Pre-human state: `READY FOR PRODUCT ACCEPTANCE — Source Bassline Practice`. No merge/push.

---

# 18. Automated test matrix

## Extraction/timing/range

- one/multiple Bass Voices, manual override, no Bass Voice
- raw integer tick exactness; no reconstruction from beat floats
- source-matched range and multi-source mismatch
- empty/unsupported/misaligned range
- all simultaneous/overlapping notes preserved
- all boundary cases and mandatory continuation booleans
- deterministic note/harmony order and independent signatures
- captured harmony gaps, duplicate/conflicting overlaps, slash bass, boundary ties

## Versioning/security

- Vault and Practice v1→v2 migration
- old Vault TypeScript path treats v2 as future readonly/non-write
- old Practice Rust+TypeScript v1 path rejects v2 without mutation
- new Vault TypeScript and Practice Rust+TypeScript >2 readonly/non-write
- 8,192-note and 1 MiB below/exact/over
- 16 MiB whole-Vault save/export/import/migration/merge below/exact/over
- prior document unchanged on denial
- malformed external object rejects whole import before write
- local corrupt data quarantine
- strict forbidden/unknown subtree keys and no personal data

## Capture/lifecycle

- no silent candidate; opt-in OFF and disabled until explicit selection
- candidate/source/range/role/analysis changes reset selection and OFF
- successful save resets OFF
- Voice id remains transient
- snapshot-free fallback only for an ON/requested snapshot that cannot attach; OFF saves normally
- immutable update rejected; duplicate deep clone; delete embedded asset

## Practice

- exact crop before projection
- 1/2-bar, empty and final partial windows
- first/last navigation disabled reason
- deterministic Level3 and projection disclosure
- L1/L2 deterministic or unavailable on missing/ambiguous harmony
- current harmony match/mismatch/unavailable
- Transfer unchanged
- stop/route/tab/source/window/level cleanup
- no History note/harmony duplication; deleted-source row remains readable

## UX/accessibility

Every new/changed surface has matching Japanese and English copy, visible labels and disabled reasons, logical keyboard order and restored focus, semantic controls, `aria-live` status changes, and usable layout at 320 CSS px and 200% zoom. Reduced-motion and no-stuck-sound paths remain covered.

---

# 19. Full release gates

P5.22-05:

- `npm run validate:phase-docs`
- validator tests
- `npm run lint`
- app TypeScript
- E2E TypeScript
- P5.22 focused
- Capture/Vault regressions
- Bass Practice regressions
- full Vitest
- Rust
- production Playwright
- full Playwright
- accessibility
- keyboard
- reduced motion
- 320px / 200%
- Web build
- Tauri release build
- security intake regression
- deterministic benchmark
- `git diff --check`
- post-test/build clean

Protected:

- P5.15 diff 0
- Analyzer/Role/Harmonic Core unexpected diff 0
- scoring/boundary/candidate diff 0
- raw MIDI tracked 0
- `.local-evaluation` tracked 0
- personal path 0
- History note duplication 0
- test visual baseline diff 0
- Cargo EOL diff 0
- `docs/CURRENT_STATE.md` absent

---

# 20. Human acceptance

1. MIDI CaptureでBass Voice候補を確認
2. 保存toggle default OFF
3. Bass Voiceを明示選択
4. note/bar/export disclosure
5. save progression
6. Progression Detailでsource availability
7. export/import後も利用可能
8. 元MIDIを移動/削除しても利用可能
9. Bassline Echoで元ベースラインsource
10. 1-bar / 2-bar window
11. Level3 source line
12. simultaneous note disclosure if present
13. Level1 root-focused
14. Level2 chord-tone simplified
15. difference facts
16. Record & Compare
17. History
18. progression edit mismatch
19. previous/next section
20. Transfer meaning unchanged
21. no automatic scoring
22. no new forbidden field in the `sourceBassline` export subtree; do not make a claim about legacy outer provenance fields
23. no stuck sound
24. old Vault still loads

---

## Definition of Done

P5.22-00 is complete only after its required gates pass on the exact Stage commit, the commit hash is recorded in `execution-state.json`, and the worktree is clean. Later stages follow the README completion conditions and human acceptance gate.

# 21. Commit rules

Each Stage:

- status/diff/diff-check
- explicit intended paths
- no `git add -A`
- no `git add .`
- staged review
- generated/private artifact 0
- explicit commit
- report/state update
- post-commit clean

No master merge.
No push.
No P5.23.
