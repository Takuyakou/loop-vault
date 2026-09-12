# P5.27 Work Instructions

## Scope

## Mission

コード進行とVoicingを
**作曲語彙として反復・定着する非採点Loop Practice**
を実装する。

品質優先。
不要な重複実装と手動テストを避ける。

---

# Start-up

Read:
AGENTS → CLAUDE → Phase README/state → proposal/contracts/references/mock。

Check:

- branch / HEAD / master
- git status
- worktrees
- merge/rebase/cherry-pick
- current Chord Dojo
- current Text Progression
- current Vault/Progression Detail
- P5.26.1 voicing resolver ancestry
- current Practice persistence
- test-output hygiene

Recommended branch:

`feat/p527-progression-voicing-practice`

Dirty:
do not reset/stash/discard.

---

# Codex UI Skill requirement

Before Stage03 production UI work:

Verify Emil Kowalski skills are available.

Expected main Skill:

```text
$emil-design-eng
```

Repository install command if missing:

```text
npx skills@latest add emilkowalski/skills
```

If missing:
STOP before production UI implementation and report.

Use:

```text
$emil-design-eng
```

for user-facing implementation/review.

Use `$prototype` only if approved mock must be materially reconsidered.

Use `$review-animations` only when meaningful animations are introduced.

Do not use skills as authority to override:

- product contract
- existing Loop Vault visual language
- accessibility
- reduced-motion
- keyboard
- viewport/zoom requirements

---

# Approved visual direction

Use:

`mock/progression-voicing-practice-approved-mock.html`

as the visual direction.

Do NOT pixel-copy arbitrary CSS into production.

Instead map its hierarchy onto:

- existing tokens
- existing controls
- existing typography
- existing panels
- existing responsive conventions

Preserve:
- MY vs LESSON grouping
- Current prominence
- Next secondary
- Beat indicator
- Progress
- Loop count
- compact controls
- dark Loop Vault visual language

---

# Stage00 audit

Do not implement yet.

Audit exact existing:

## Chord Dojo
- Flow transport
- Step/Flow state machine
- Shell generator
- Open generator
- Rootless A/B
- Auto/source resolver
- keyboard visualization
- MIDI input comparison

## Voicing
- Source MIDI representation
- Custom representation
- P5.26.1 shared resolver
- persistence boundary
- pitch/degree derivation

## Practice
- snapshot patterns
- metronome
- count-in
- clock/transport
- route lifecycle
- cleanup
- feature flags
- settings

## Text/Vault
- save result
- Progression Detail handoff
- source deleted/edited behavior

Lock reuse plan.

No duplicate engine.

---

# Lesson Rule Table

Stage00 creates a human-readable, testable table.

At minimum audit:

```text
maj7 / maj9
m7 / m9
7 / 9 / 13
6 / 6/9
m6
m7b5
dim
sus
altered dominant
slash chords
```

For each:

```text
Basic Shell
Basic Full
Left-hand
support status
source of rule
```

Rule sources priority:

1. existing approved Loop Vault Chord Dojo rule
2. user's lesson-derived approved rule
3. explicit user-approved addition

Never:
- invent missing lesson rules
- silently import arbitrary Jazz textbook rules

---

# Basic 1–7–3

Concept:

```text
Shell
→ Full
```

Possible examples subject to Stage00 lock:

```text
maj7:
1 + 7
1 + 7 + 3

m7:
1 + b7
1 + b7 + b3

7:
1 + b7
1 + b7 + 3

6:
1 + 6
1 + 6 + 3

m6:
1 + 6
1 + 6 + b3
```

Examples are not production truth until audited.

---

# Left-hand

Reuse existing Rootless/Left-hand implementation where correct.

Must expose degree structure.

Do not treat "Left-hand" as merely "notes below middle C".

It is a lesson Voicing family.

If selected chord has no approved rule:
`UNSUPPORTED_RULE`.

---

# Source / Custom

First-class v1 modes.

Source:
- preserve saved/source exact pitch/octave
- use P5.26.1 resolver semantics
- no regenerated chord-symbol voicing when source exists

Custom:
- preserve exact saved compatible voicing
- no relabel as Source

Missing:
explicit unavailable state.

No silent fallback.

---

# Practice Clock

Use ONE musical transport/source of truth.

Derive:

- current chord
- next chord
- current beat
- chord progress
- progression progress
- loop count

Avoid independent setIntervals.

Clock must survive:
- pause/resume
- BPM change
- count-in
- 1/2/4 chord per bar
- mixed durations
- long loops

---

# Pause/Resume

Stage00 locks exact behavior.

Preferred:
pause preserves musical position.

Resume should be deterministic.

Do not accidentally start multiple transports.

---

# No scoring

Hard invariant.

Search implementation/diff for accidental:
- score
- accuracy
- correct
- incorrect
- passed
- streak
- mastery
- success-driven advance

MIDI input never blocks timeline.

---

# Snapshot

Practice session must be detached.

Session start snapshot includes only safe required facts:

- chord identity/display
- timing
- key
- bpm
- meter
- compatible Source/Custom voicing facts
- selected practice mode/family

Do not store:
- original file path
- raw MIDI
- private title in generic Practice persistence unless existing safe contract allows
- analysis diagnostics
- device identifiers

---

# UI interaction

Primary:

```text
Start / Pause
Restart
Voicing show/hide
Metronome
BPM
Voicing source/family
```

Optional:
reference current chord.

Keyboard shortcuts:
audit existing Practice shortcuts before assigning.

Avoid conflicts.

Beat indicator cannot rely on color only.

---

# UI motion

Frequent practice interactions should feel immediate.

Default:
minimal motion.

Do not animate every beat with large scale/translation.

Allowed:
- subtle state color/fill
- short button feedback
- restrained chord transition

Reduced motion:
must remain clear with motion disabled.

---

# Tests

## Domain clock
- count-in
- 1 chord/bar
- 2 chords/bar
- 4 chords/bar
- mixed duration
- last→first
- loop increment
- pause/resume
- restart
- BPM change
- deterministic long simulation

## Voicing
- Source exact
- Custom exact
- Basic rule table
- 6-family
- Left-hand table
- unsupported
- generation error
- degree display
- no silent fallback

## Lifecycle
- rapid start/pause
- restart
- route exit
- mode switch
- source switch
- stale timer 0
- retained audio player 0

## No scoring
- wrong MIDI input
- extra notes
- no MIDI
all leave timeline unaffected.

## UI
- Current / Next
- Beat
- progress
- loop
- Learn/Recall
- MY/LESSON grouping
- 320px
- effective 200%
- keyboard
- reduced motion
- axe serious/critical 0
- no horizontal overflow

## Integration
- Text saved progression
- Vault Progression Detail
- edited source after session start
- deleted source
- Source/Custom unavailable

---

# Long-loop reliability

Run deterministic long simulation.

Goal:
equivalent to >=30 minutes musical runtime without wall-clock wait if possible.

Check:
- event/timer count stable
- active handle delta 0
- player/resource retained 0
- memory-growing array/history 0
- loop count deterministic

---

# Test/build optimization

Intermediate:
- focused tests
- relevant regression
- lint/typecheck
- docs
- diff-check

UI Stage:
- focused Playwright
- accessibility/viewport
- visual diff only affected surfaces

Final:
- full Vitest
- full relevant Playwright
- Rust if affected
- Web build
- Tauri build if release workflow requires
- security/privacy
- long-loop benchmark
- final hygiene

Do not rerun heavy gates on docs-only closure with unchanged code candidate.

---

## Non-goals

# Protected

Do not change unless explicitly required:

- Analyzer
- P5.26 harmonic logic
- chord ranking
- MIDI Exporter
- Vault schema/fileVersion
- existing Chord Dojo scoring semantics
- Bass Practice
- raw MIDI
- Source Voicing persistence
- Custom Voicing semantics

No tracked:
- private MIDI/audio
- `.local-evaluation`
- personal absolute path

---

## Definition of Done

- All stages P5.27-00 through P5.27-05 have independent verified commits.
- The no-scoring, single-clock, explicit-unavailable, detached-snapshot, and privacy contracts are proven.
- Required focused and final gates are recorded against the candidate commit.
- Product Acceptance stops at `READY FOR PRODUCT ACCEPTANCE — Progression Voicing Practice`.
- Merge, push, tag, and P5.28 remain outside this phase.

---

# Commit rules

Each Stage:

- status/diff
- focused verification
- `git diff --check`
- explicit paths only
- no `git add -A`
- no `git add .`
- staged diff review
- independent commit
- report/state
- clean status

No merge.
No push.
No P5.28.
