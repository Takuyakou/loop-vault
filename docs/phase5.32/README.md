<!-- phase-id: 5.32 -->
# Phase 5.32 — Suggested Fingering for Voicing Loop

Read the root `AGENTS.md` first, then follow the required reading order below.
Git is the source of truth when supplied phase material differs from the
integrated product.

## Status

- **Status:** in progress
- **Active stage:** P5.32-01 (not authorized)
- **Completed stages:** P5.32-00
- **Next action:** stop and wait for separate authorization before P5.32-01

## Required Reading Order

1. Root `AGENTS.md`
2. [`work-instructions.md`](work-instructions.md)
3. [`execution-state.json`](execution-state.json)
4. [`contracts/01-scope-and-non-goals.md`](contracts/01-scope-and-non-goals.md) through [`contracts/12-git-privacy-hygiene.md`](contracts/12-git-privacy-hygiene.md)
5. [`references/FINGERING-GUIDE-EXTRACT.md`](references/FINGERING-GUIDE-EXTRACT.md)
6. [`references/piano-chord-fingering-guide.html`](references/piano-chord-fingering-guide.html)
7. [`reports/README.md`](reports/README.md)

## Goal

Reduce the repeated decision cost of:

> 「このVoicingは、どの指で押さえればいい？」

Voicing Loop already tells the user **what chord / pitches / degrees / keys** to
play. P5.32 adds a fourth layer:

```text
Chord
→ Pitch
→ Degree
→ Suggested Fingering
→ Keyboard
```

The product must never present a fingering as the one universally correct answer.

The label is:

- `おすすめ運指`
- `Suggested Fingering`

and not:

- `正解`
- `Correct Fingering`

## Product principle

A chord symbol does not determine fingering.

P5.32 resolves fingering from the **actual resolved voicing**:

```text
resolved MIDI pitches
+ hand
+ voicing family
+ previous/current/next progression context
+ optional user override
```

The app must not infer fingering from `Am9` alone.

## Source basis

The user supplied:

- `references/piano-chord-fingering-guide.html`

The guide explicitly supports the following design principles:

1. decide the actual notes/voicing before deciding fingers;
2. begin from common first-choice finger patterns;
3. test the fingering across neighboring chords, not one chord in isolation;
4. common-tone / small-movement voice leading is useful;
5. keeping a pitch does not require keeping the same finger;
6. thumb-on-black-key is not an absolute error for chords;
7. a chosen fingering should be recorded and repeated rather than re-decided every time;
8. individual optimal fingering is not guaranteed by a generic rule.

P5.32 converts those principles into a conservative, deterministic suggestion
engine plus user override.

## Must deliver

- Fingering display for:
  - Source MIDI
  - Custom
  - Basic Shell
  - Basic Full
  - Full Shell
  - Left-hand
- Right/Left hand selector where the current Voicing mode allows it.
- Left-hand mode stays left-hand only.
- Finger numbers shown in:
  - CURRENT
  - NEXT
  - keyboard keys
- Fingering display can be turned on/off.
- Suggestions derive from exact resolved pitches; voicing pitches are never mutated.
- Progression-aware ranking considers neighboring chords and the loop boundary.
- User can save/reset a personal fingering when a safe existing persistence path is confirmed.
- Saved personal fingering wins over the automatic suggestion for the exact physical voicing signature.
- No scoring/mastery/correctness judgment.
- P5.31 rest/hold/re-strike semantics remain coherent if present:
  - re-strike => same fingering;
  - hold => inherit, no new decision;
  - rest => no fingering target.
- P5.30/P5.31 Voicing Loop timing/audio/UI contracts remain protected.

## Stage map

| Stage | Scope |
|---|---|
| P5.32-00 | Repository audit, source-rule extraction, persistence/hand-mode contract lock |
| P5.32-01 | Fingering domain + bounded candidate generation + golden fixtures |
| P5.32-02 | Progression-aware / cyclic ranking engine |
| P5.32-03 | Voicing Loop UI + optional personal fingering persistence |
| P5.32-04 | Integration, accessibility, performance, product acceptance |

Start with **P5.32-00 only** unless explicitly instructed to run remaining stages.

## Stages

### P5.32-00 — Audit / baseline / contract lock

Audit the integrated product, lock hand and persistence boundaries, and add
executable baseline fixtures without production fingering behavior.

### P5.32-01 — Domain / candidates

Implement the bounded pure fingering domain.

### P5.32-02 — Progression ranking

Implement deterministic cyclic progression-aware ranking.

### P5.32-03 — UI / persistence

Integrate the suggestion UI and the authorized app-local preference collection.

### P5.32-04 — Hardening / acceptance

Run final regression, accessibility, performance, and product acceptance gates.

## Hard non-goals

- no computer-vision hand tracking;
- no automatic judgment of whether the user's fingers were actually used;
- no fingering score;
- no hand-size biometric inference;
- no “thumb on black = invalid” rule;
- no Drop 2 / quartal / upper-structure fingering system in this phase;
- no arbitrary reharmonization or voicing changes;
- no Vault schema/fileVersion change;
- no Analyzer/MIDI Export changes;
- no auto merge/push/tag/release/P5.33.
