# Phase 11 — Voicing Source / Save / Playback & Range Loop Contract v4

- Status: Freeze candidate / execution source of truth
- Phase 10: completed
- Precondition: Phase 11 starts only from `master` that already contains `feat/p10.0-07-finish`
- Vault schema: change only with explicit human gate
- Training redesign: deferred

## Accepted execution deltas

The human explicitly approved P11-01 and P11-02 through P11-06. Primary generated types are 基本 (Teacher) / 骨組み (Core). Preserve Color/Open and all audited legacy modes under 詳しい設定; no new upper-triad generator. P11-05 human-note preservation is authorized; Source MIDI compatibility stays guarded. Actual repository Text provenance is `text-style-v1:`; occurrences of `text-style:` below describe the superseded package proposal. Final fresh FULL and runnable Windows EXE are required; no master merge/push/tag/release. Reuse the existing isolated D-drive Phase 11 worktree.

## 0. Goal

Keep the current Voicing Loop central layout and practice flow largely intact while stabilizing:

1. Voicing source meaning
2. save/reload/playback consistency
3. partial-source fallback
4. top-row source UI
5. A–B partial range looping

Visible sources:
- **保存した音**
- **元MIDI**
- **カスタム**
- **自動生成**

## 1. Phase 10 contract is already fixed

Phase 11 reads the Phase 10 contract; it must not redefine it.

### Corrected/manual Voicing
- storage: `practiceVoicingOverride`
- `source: "manual"`
- `extractorVersion: "p10-correction:v1"`
- `playbackChoice: "CUSTOM"`

### Uncorrected MIDI
- `sourceVoicing`
- `source: "midi-extracted"`
- `extractorVersion`: analyzer/extractor value recorded at MIDI analysis

### Start precondition
1. Read root and applicable nested `AGENTS.md`.
2. Update local `master`.
3. Verify `feat/p10.0-07-finish` is already incorporated into `master`.
4. Only then create a dedicated Phase 11 branch/worktree from that master.

If not already merged: **do not merge automatically**. Stop with `BLOCKED_PHASE10_NOT_MERGED`.

## 2. Meaning of the four sources

| UI | Meaning |
|---|---|
| **保存した音** | the currently persisted/adopted explicit Voicing for the card |
| **元MIDI** | original MIDI-imported `sourceVoicing` |
| **カスタム** | user-explicit override provenance |
| **自動生成** | runtime generated Voicing from chord identity |

### 保存した音 is not history

`保存した音` is **not** an immutable historical snapshot of an old save operation. If a later explicit override replaces the saved content, `保存した音` also changes to the current persisted/adopted explicit Voicing.

### Initial classification to audit/freeze in P11-00

| Persisted content | 保存した音 | カスタム | 元MIDI |
|---|---:|---:|---:|
| override with `extractorVersion` starting `text-style:` | yes | no | no |
| override `p10-correction:v1` | yes | yes | no |
| other explicit override, e.g. live/manual | yes | yes | no |
| adopted `sourceVoicing` | yes | no | yes |
| generated-only playback | no | no | no |

Origin classification is provenance-based. **Do not regenerate a Voicing and compare notes to decide whether it is Text style.** Audit current `textProgressionStyleFromSnapshot`; future generator changes must not silently reclassify persisted data.

## 3. 保存した音 resolution

P11-00 must freeze exact precedence after reading actual code.

### `playbackChoice = CUSTOM`
Valid persisted explicit override -> 保存した音 available.

### `playbackChoice = SOURCE`
Valid persisted Source -> 保存した音 available.

### `playbackChoice = GENERATED`
No persisted explicit notes -> 保存した音 unavailable. Handle through X/N fallback when needed.

### missing playbackChoice / legacy
Follow current persisted-card resolution only up to the generated step. Candidate order to verify:
1. valid Custom
2. user-verified Source
3. valid Source
4. if next outcome would be Generated -> 保存した音 unavailable

Generated output must never be presented as 保存した音.

### renamed/incompatible cards
Audit cards whose chord identity changed after explicit notes were saved. Card audition, 保存した音, and Voicing Loop must not silently play different notes.

## 4. Card audition consistency

Hard acceptance:

> When persisted explicit notes exist, progression-card audition and Voicing Loop `保存した音` play the same MIDI note numbers.

If card audition falls back to Generated because no persisted explicit notes exist, that does **not** make 保存した音 available.

## 5. Text Preview / Save contract

### Previewed sound
It means the **resolved Preview Voicing State at Save time**, not whether the user actually pressed Play.

### Exact snapshot
Do not regenerate a merely similar Voicing at Save time if resolved preview notes already exist.

Acceptance:

```text
Preview resolved MIDI note numbers
== saved explicit MIDI note numbers
== reload card-audition persisted notes
== reload Voicing Loop 保存した音
```

Exact MIDI-note equality, not pitch-class equality.

Standard Text and Extended Text both follow this contract. If Extended has a separate preview resolver, persist its actual resolved preview output.

Legacy Text receives no silent backfill.

## 6. Source availability

Availability comes from actual persisted data, not intake labels.

### 0/N
Example `元MIDI 0/16`:
- do not switch source;
- P11-10 Human Acceptance supersedes the prior activation-banner policy: native disabled, visible 0/N, visually unavailable;
- no ordinary-screen availability banner; explain through title / accessible description;
- stale unavailable Source selection recovers through existing available-source priority; partial X/N selection stays usable.

### X/N
Example `元MIDI 5/8`:
- selectable;
- progression can Start;
- missing cards use **visible AUTO fallback**;
- fallback uses a small corner marker/icon, not text that may not fit;
- tooltip/focus label: `自動生成で補完`;
- no silent fallback.

Optional neutral info: `8コード中5コードで元MIDIを使います。3コードは自動生成で補います。`

Same architecture should support 保存した音 X/N and カスタム X/N.

### N/N
Normal selectable state; no info required.

## 7. Partial fallback

```text
if selected source exists for event:
    use exact selected notes
else:
    use explicit AUTO fallback
    render AUTO marker
```

Selected persisted/source events are fixed and cannot be altered to make fallback easier.

P11-00 freezes the fallback generated profile and whether it follows the selected generated type or a fixed default.

## 8. Generated types require human approval

P11-00 audits:
- Teacher
- Core
- Color
- Open
- rootless
- left-hand
- basic-full
- full-shell
- all other relevant generated modes/rules

Create a migration matrix:

| Current control | Current behavior | Candidate destination | Keep / Advanced / Retire | Reason | Alternative |
|---|---|---|---|---|---|

**P11-00 does not finalize generated type names and does not delete legacy controls.**

After P11-00 and P11-01, stop at a mandatory human gate. Human approves the migration matrix and generated-type naming before P11-02 continues.

## 9. Header direction after the gate

Direction only; generated labels are not frozen before the gate:

```text
ボイシング [保存した音] [元MIDI] [カスタム] [自動生成] [生成タイプ ▾]
表示       [覚える] [思い出す]
           [進行に合わせて最適化] [おすすめ運指を表示]
```

Use one generated-type selector, not four permanent buttons.

P11-10 Human Acceptance: generated-type and details triggers stay visible but disabled for 保存した音 / 元MIDI / カスタム. Source changes close details. 自動生成 enables them again and restores the session's previous generated family, Basic/Core, left-hand variant, Color and Open; no schema change.

Unsupported generated type for a chord: `このコードにはこの生成タイプの形がありません。`
No silent substitution.

## 10. Optimization / fingering

### Optimization
- 保存した音: disabled
- 元MIDI: disabled
- カスタム: disabled
- 自動生成: enabled if supported

Fixed-note sources must not have inversion/register/octave changed.

For X/N mixed source, fallback events may be optimized only if P11-00 proves fixed events can remain exact anchors; otherwise mixed optimization is disabled.

### Fingering
P11-00 determines whether fingering works safely on arbitrary fixed notes and whether it changes note selection. If safe, it may remain available for fixed sources.

## 11. Initial source selection

Restore previous source for that progression if still usable.

Otherwise priority:
1. 保存した音 N/N
2. 元MIDI N/N
3. カスタム N/N
4. 自動生成

X/N is usable but N/N is preferred for automatic initial choice.

Audit existing local/settings state before adding storage; do not change Vault schema merely to remember selection.

## 12. Current 覚える / 思い出す

Phase 11 does not redesign practice behavior. P11-00 documents and preserves current behavior, including:
- whether user-pressed notes remain visible in 思い出す;
- when answer notes appear;
- source-switch interactions.

## 13. Range Loop

### Purpose
Repeat a portion of the progression without changing its Voicings. Session-only; not saved to Vault.

### Primary controls
- right click 1 -> pending A (`ここから`)
- right click 2 -> B and atomically confirm A–B
- reverse order -> automatically normalize
- same card twice -> one-card range
- **Shift + right click** -> immediately replace with a one-card range
- no double-click range binding

### Existing range + new pending A
If an active range already exists:
- first new right click creates pending A;
- old active range continues playing;
- old range is not cleared yet;
- second right click confirms B and atomically replaces old range;
- range-loop count resets to 0.

Esc cancels pending A and keeps old range.

If no old range exists, pending A alone leaves full-progression playback active until B is confirmed.

### Keyboard equivalent
On selected/focused card, `Shift+F10` or Menu key invokes the same action as a normal right click, after conflict audit.

### Range identity
Because `eventId` can be absent, session card ordinal/index is authoritative; eventId is optional assistance.

### Visuals
- A/B markers
- thin range highlight
- outside cards slightly dim but selectable
- transport chip: `区間ループ 2〜4 ×`
- compact: `区間 2〜4 ×`

### Clear
× clears active range, pending A, visual and range-loop count. Do not abruptly cut the current chord; return to full progression after the current chord boundary.

### Card click while active
- inside range left-click -> normal seek/select
- outside range left-click -> selection/inspector update only, no seek and no range clear
- card ▶ audition -> always independent of range

## 14. Range playback

### Start with active range
1. count-in
2. A
3. ... B
4. wrap to A
5. no further count-in

### Pending A only
- old range exists -> keep old range
- no old range -> keep full progression

### New range confirmed while playing
Finish current chord, switch at chord boundary, begin new A, no double attack.

### Stop / Beginning
- Stop -> stop and position at A
- Beginning -> A with count-in

### Clear while playing
Finish current chord naturally, then resume full-progression loop semantics.

## 15. Count-in / meter phase

A range beginning mid-measure preserves original metrical phase. It must not become a fake beat 1.

P11-01 verifies:
- 4/4 beat 1
- 4/4 beat 3
- 3/4
- 5/4

A one-measure count-in preserves the original phase so A still enters at its original beat position.

## 16. Range Voicing contract

Creating a range never regenerates or re-optimizes Voicings.
Use exactly the already-resolved full-progression Voicings for all source types.

Range-only optimization is forbidden.

## 17. Range transport architecture

P11-01 audits and chooses:

### Candidate A — derived short snapshot
Only if it safely preserves:
- original card index/id
- global beat
- metrical phase
- time-signature phase
- resolved Voicing
- event order
- first-chord scheduling
- mid-play replacement

### Candidate B — native loop bounds
Use loopStart/loopEnd in transport/clock if Candidate A cannot preserve semantics safely.

Do not choose A merely because it changes less code.

## 18. Note / sustain safety

P11-01 first audits the actual playback path.

If CC64 MIDI sustain is not used: record `CC64 = NOT_APPLICABLE`; do not implement irrelevant handling.

Where applicable test:
- no stuck notes;
- old note-off does not kill next-loop same-pitch note;
- no duplicate first attack;
- no sustain leak;
- cleanup is not unnaturally abrupt.

## 19. Responsive/header facts

The previous width audit used old labels (Lesson Rules / Teacher etc.). Treat it as evidence about space/breakpoints only, not proof that final labels fit.

P11-04 re-measures actual approved labels and selector width at:
- 1920
- 1600
- 1444
- 1366
- 1280
- 960

Goals:
- 1444 one row mandatory
- 1366 one row target
- 1280 one row target if readable
- ~960 wrap allowed
- no page-level horizontal scroll

## 20. Execution order

### Precondition
1. Read AGENTS.md.
2. Verify `feat/p10.0-07-finish` is already in master.
3. Create a dedicated Phase 11 worktree from that master.
4. If not already merged: stop `BLOCKED_PHASE10_NOT_MERGED`; do not merge automatically.

### P11-00 — Audit / Freeze
No product behavior change.

Deliver:
- source mapping
- 保存した音 resolution table
- Standard/Extended preview-save-reload audit
- Phase 10 marker confirmation
- generated migration matrix
- generated naming proposal
- optimizer/fingering matrix
- current 覚える/思い出す behavior
- previous-source storage options
- Range transport recommendation
- CC64 applicability
- header implementation facts

### P11-01 — Range Loop
Implement Range Loop independently.

After P11-01: focused/feature/UI tests + screenshots + report.

### HUMAN GATE — mandatory
**STOP after P11-00 + P11-01.**

Human reviews:
- generated migration matrix
- generated naming proposal
- unresolved product-semantic choices
- Range result

Do not continue P11-02 without explicit approval.

### P11-02 — 保存した音 / Persistence
After gate approval:
- exact Standard/Extended preview persistence
- provenance-based origin classification
- CUSTOM/SOURCE/GENERATED/missing
- card audition consistency
- legacy compatibility

### P11-03 — Partial Source Fallback
Before final X/N header UX:
- X/N Start allowed
- visible auto fallback
- compact marker
- no silent fallback
- fixed source notes unchanged

### P11-04 — Header UI
After P11-03:
- four sources
- generated selector from approved migration
- availability UI
- aria-disabled explanations
- previous selection restore
- initial priority
- optimization/fingering gating
- actual final width re-measurement/screenshots

### P11-05 — Resolver consistency
Only if P11-00 proves a real inconsistency.

### P11-06 — Cleanup / final regression
Only after every legacy generated control has a migration destination. No silent feature deletion.
Fresh FULL once after stabilization, then Windows EXE.

## 21. Repo/process requirements

Maintain:
```text
docs/phase11.0/
  README.md
  execution-state.json
  reports/
```

- run `npm run validate:phase-docs` before docs commits;
- in P11-00 inspect/reuse the Phase 10 pre-commit protection so validation is not skipped;
- do not invent a parallel hook system if the repo already has one;
- dedicated Phase 11 worktree only;
- do not reuse it for unrelated work;
- **do not use `git add -A`**; stage intended files explicitly;
- no master merge / push / tag / release without explicit authorization;
- use `npm run p89:screens` where applicable and automate Phase 11 viewport screenshots;
- reports are Japanese;
- product decisions are written as `選んだこと / 理由 / 別案`;
- if an old EXE is running/locked, use a safe alternate target/output directory following existing repo convention and report the exact EXE path.

## 22. Test policy

During work:
- focused tests
- FAST / FEATURE
- UI screenshots as relevant
- no repeated FULL after tiny edits

After stabilization:
- one fresh FULL
- Windows EXE

## 23. Mandatory tests

### Saved Voicing
- Standard Text
- Extended Text
- MIDI Source
- P10 corrected MIDI
- Custom
- GENERATED unavailable as 保存した音
- legacy missing playbackChoice
- renamed/incompatible card

### Fallback
- 0/N
- 1/N
- alternating X/N
- N-1/N
- first missing
- last missing
- N/N
- compact fallback marker/accessibility
- fixed notes unchanged

### Header
- aria-disabled focusable/activatable
- ordinary 0/N shows reason only on activation
- × only hides info
- keyboard accessibility
- previous source restore
- responsive geometry/screenshots

### Range selection
- right-click A/B
- reverse order
- same-card twice
- Shift+right-click
- Shift+F10 / Menu key equivalent
- old range remains while new A is pending
- Esc cancels pending only
- atomic replacement
- clear

### Range playback
- pending-only with no old range -> full loop continues
- pending-only with old range -> old loop continues
- count-in 0/1/2
- 4/4 beat1
- 4/4 beat3
- 3/4
- 5/4
- first chord every wrap
- one-card range
- mid-play replacement
- clear while playing
- Stop / Beginning / Pause / Resume
- outside-range left-click does not seek
- card ▶ audition independent

### Audio safety
- determine CC64 applicability
- same-pitch wrap
- release crossing B
- no duplicate first attack
- no stuck note

## 24. Frozen decisions

1. Source names: 保存した音 / 元MIDI / カスタム / 自動生成.
2. 保存した音 = current persisted/adopted explicit Voicing, not historical save history.
3. GENERATED-only card is unavailable in 保存した音.
4. Text origin classification uses provenance metadata, not regenerated-note equality.
5. `text-style:` override -> 保存した音 yes / カスタム no.
6. `p10-correction:v1` -> 保存した音 yes / カスタム yes.
7. other explicit override -> 保存した音 yes / カスタム yes, subject to P11-00 verification.
8. adopted sourceVoicing -> 保存した音 yes / 元MIDI yes / カスタム no.
9. card audition and 保存した音 match exact notes when persisted explicit notes exist.
10. X/N can Start through visible auto fallback.
11. silent fallback prohibited.
12. generated naming/migration requires human approval after P11-00/P11-01.
13. fixed-note sources are not progression-optimized.
14. 0/N is not an automatic warning state.
15. unavailable controls remain explainable/focusable.
16. Phase 10 is complete; Phase 11 reads its fixed provenance markers.
17. Range is session-only.
18. right-click A/B is primary.
19. Shift+right-click makes one-card range.
20. no double-click range binding.
21. old range remains active until new B is confirmed.
22. pending A alone does not replace playback range.
23. Esc cancels pending A.
24. session card index can replace missing eventId.
25. original metrical phase is preserved.
26. outside-range left-click selects only, no seek.
27. card audition is range-independent.
28. fallback marker is compact visual marker + tooltip/accessible text.
29. final header width is re-measured with approved names.
30. mandatory human gate after P11-00 + P11-01.
