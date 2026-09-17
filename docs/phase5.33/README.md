<!-- phase-id: 5.33 -->
# Phase 5.33 — Voicing Rule Engine v2 / Research-Grounded Practice Architecture

Read the root `AGENTS.md` first, then follow the required reading order below.
Git is the source of truth when the supplied research package differs from the
integrated product.

## Status

- **Status:** completed — ready for renewed human acceptance
- **Active stage:** none
- **Completed stages:** P5.33-00 through P5.33-05
- **Next action:** run the renewed Human Acceptance checklist; no merge, push,
  tag, release, or P5.34 without separate authorization

## Required Reading Order

1. Root `AGENTS.md`
2. [`work-instructions.md`](work-instructions.md)
3. [`execution-state.json`](execution-state.json)
4. [`contracts/01-research-promotion-contract.md`](contracts/01-research-promotion-contract.md) through [`contracts/15-keyboard-transport-layout-contract.md`](contracts/15-keyboard-transport-layout-contract.md)
5. [`references/research/voicing_rules_33.json`](references/research/voicing_rules_33.json)
6. [`references/research/作曲用Voicing — Rulebook.html`](references/research/作曲用Voicing — Rulebook.html)
7. [`references/RESEARCH-PROMOTION-NOTES.md`](references/RESEARCH-PROMOTION-NOTES.md)
8. [`references/ui/ADOPTED-UI-SCOPE.md`](references/ui/ADOPTED-UI-SCOPE.md)
9. [`reports/README.md`](reports/README.md)

The prefixed work/state files are preserved as supplied intake artifacts. The
unprefixed files above are the live repository workflow documents.


## Goal

Turn the recent voicing research into a **safe, testable, progression-aware rule
engine** for Voicing Loop without throwing away the parts that already work:

- P5.29 musical clock / harmonic rhythm
- P5.30 slim progression / audition / reference sound
- P5.31 Text + slash/control semantics
- P5.32 LEFT/RIGHT display, keyboard fingering, personal fingering

The product goal is no longer:

> force every chord into one vague “Shell” definition

It is:

> choose a musically justified voicing family for the practice context, show
> exactly what LEFT/RIGHT hands do, explain reductions/omissions, and let the
> player repeat that vocabulary through the progression.

## Human Acceptance follow-up — generalized Study Generator

The current runtime no longer treats promoted research record IDs as a chord
whitelist. Teacher and Core are exclusive chord-family base strategies; Color
and Open are independent modifiers. The research JSON and S01-S16 remain
non-runtime semantic validation evidence. Ordinary supported chord families
are generated first, then validated, optionally ranked across the complete
cycle, and passed to the existing fingering engine. Source MIDI and Custom
remain exact, separate sources.

Teacher output is internally identified as `teacher-derived-generalized`:
the principles derive from teacher evidence, while concrete pitches, octaves
and suggested fingering are app-generated.

The latest follow-up makes Candidate n/N directly operable, keeps manual
comparison session-only, and ranks Literal/Practical Reduction alternatives
with bounded density/omission cost across the full cyclic progression. The
verified implementation commit is
`5821b46d3950ea886e84b99479dc82aaadd96f70`; renewed human musical acceptance
is still required.

The extended-reduction follow-up now generalizes degree-based m11, dominant 11,
m13, dominant 13 and maj13 candidates across roots. Literal, OMIT 5 and
OMIT 5 · 9 remain comparable; explicit b9/#9/#11/b13 is preserved, slash
bass stays fixed, and chromatic clusters are redistributed across register/hands
rather than silently deleted. The verified implementation commit is
`8c5e14111ad3de09ab3457decfca83938ecaf8c3`; renewed human musical
acceptance is required.

## Research inputs

This package contains the user-supplied research artifacts:

- `references/research/voicing_rules_33.json`
- `references/research/作曲用Voicing — Rulebook.html`

Important: the JSON explicitly declares itself a **research/design proposal**,
not a production-compatible rule database. It must be used as a Golden Corpus /
promotion source, not blindly loaded as runtime truth.

## Adopted UI scope — important

The user adopted the following P5.33 presentation changes:

1. SOURCE / STUDY / DISPLAY compact toolbar
2. CURRENT card
3. compact NEXT card
4. BEAT / POSITION / LOOP row
5. mode-independent **88-key A0–C8 keyboard geometry**
6. removal of dead black space below the actual keys
7. reallocation of that freed height to a larger, easier-to-operate Transport bar

Visual references:

- `references/ui/adopted-top-region.png`
- `references/ui/keyboard-transport-current-issue.png`
- `references/ui/voicing-loop-research-architecture-mock.html`

### Protected / changed lower surfaces

Do **not** redesign:

- left sidebar
- PROGRESSION timeline

Keyboard behavior/layout may change only under the explicit P5.33 keyboard
contract:

- always 88 keys / A0–C8;
- same geometry in every source/study/mode;
- active notes, LH/RH colors and finger labels may change;
- the keyboard must not zoom/reframe based on active-note range;
- remove unused black dead space below the physical key surface.

Transport may change only in size/layout density:

- use the freed keyboard dead-space height;
- make Start / Restart / Stop / reference / metronome controls easier to hit;
- do not change transport, clock or audio semantics.

## Adopted upper UI

```text
SOURCE
[Lesson Rules] [Source MIDI] [Custom]

STUDY
[Teacher] [Core] [Color] [Open]

DISPLAY
[Learn] [Recall] [✓ 指番号]

CURRENT
Dmaj7
[Teacher Open] [Literal] [候補 1/1]

LEFT HAND｜左手             RIGHT HAND｜右手
PITCH ...                   PITCH ...
CHORD TONE ...              CHORD TONE ...
FINGER ...                  FINGER ...

RULE ...
OMIT ...
TOP ...

NEXT
compact LEFT / RIGHT preparation

BEAT ...     POSITION ...     LOOP ...
```

When `Source MIDI` or `Custom` is selected, STUDY is visually inactive and must
not alter the exact saved pitches/octaves.

## Architecture principle

The phase separates concepts that were previously mixed into one “Voicing” enum.

```text
SOURCE
  generated lesson rules | Source MIDI | Custom

STUDY CATEGORY
  Teacher | Core | Color | Open

RULE FAMILY
  e.g. Teacher Open, Bass + Guide Tones, Slash Bass + RH Triad,
  Open Spread, Dominant Shell + Upper Structure...

VARIANT
  alternative candidate within the same chord/context

COVERAGE
  Literal | Performance Reduction | Creative Enrichment

CONTEXT
  self-played bass | external bass | fixed melody/top | both-hands harmony ...

PROVENANCE
  teacher evidence | external theory | analysis/proposal
```

These axes must not collapse back into one enum.

## Original P5.33 first production scope (historical foundation)

The bounded promotion below established the original engine and Golden Corpus.
The Human Acceptance follow-up above supersedes exact promoted-rule lookup in
runtime resolution; these records remain semantic fixtures and provenance
evidence rather than a production chord whitelist.

P5.33 does **not** productionize all 33 research records.

It establishes the engine and promotes a bounded first wave that covers the
current practical gaps and gives every adopted STUDY category at least one real,
honest implementation.

### First-wave promotion candidates

Core / slash / characteristic families:

- V01 — `C/E`
- V03 — `Eadd9/F#`
- V04 — Bass + RH Guide Tones
- V22 — `Am9/C`
- V23 — `Am11/B`
- V24 — `Dadd9/E`
- V25 + V26 — `Gmaj9/A` compact/full variants
- V29 — `m7b5` characteristic core
- V30 — `dim7`
- V31 — upper triad over non-triad bass (`D/C`)
- V32 — `6/9`
- V33 — `7sus4`

Teacher:

- V06 — Teacher Open role split, promoted only to the extent supported by teacher evidence
- teacher-derived dominant color patterns from T23/T27 may be promoted only
  after Stage00 resolves context/bass assumptions

Color:

- V20 — Dominant Shell + Upper Structure Triad
- V21 — Altered dominant + minor Upper Structure

Open:

- V15 — Two-handed extended spread
- V16 — Open triad
- V17 — Drop 2 transform

### Deferred

- wholesale import of all 33 records
- automatic reharmonization
- quartal / So What production families (V18/V19)
- generic rootless A/B mode when the required external Bass context is not
  explicitly present
- AI-generated melody
- auto-transcription of teacher PDFs
- scoring user performance
- automatic “best” creative enrichment without user-visible provenance

## Hard product requirements

1. Source MIDI / Custom stay exact and fail closed.
2. Original chord identity is preserved.
3. Slash Bass does not replace the upper/root identity.
4. Literal / Reduction / Enrichment are distinct.
5. Omitted notes are explicit in Reduction.
6. Creative added notes are explicit in Enrichment.
7. No invented Melody may be labelled as teacher-provided Melody.
8. Characteristic tones (sus4, b5, bb7, alterations) are not silently simplified.
9. Candidate selection evaluates loop end → start as well as internal transitions.
10. Suggested fingering happens **after** voicing resolution.
11. No scoring.
12. No Vault schema/fileVersion change without a new explicit authorization.
13. Normal desktop Voicing Loop remains a no-scroll practice surface.

## Stages

| Stage | Scope |
|---|---|
| P5.33-00 | Repository + research audit, old-rule mapping, promotion gate |
| P5.33-01 | Domain axes + Golden Corpus + semantic tests |
| P5.33-02 | First-wave deterministic rule promotion |
| P5.33-03 | Candidate/variant engine + cyclic voice-leading ranking |
| P5.33-04 | Adopted upper UI only |
| P5.33-05 | Full integration, no-scroll, accessibility, product acceptance |
### P5.33-00 — Audit / promotion gate

Inventory the current product and classify research records without changing
runtime behavior.

### P5.33-01 — Domain axes / Golden Corpus

Add separated domain axes and semantic fixtures only after explicit approval.

### P5.33-02 — First-wave rules

Promote only the Stage00-approved bounded rules.

### P5.33-03 — Candidate variants / cyclic ranking

Add deterministic candidate selection including loop end-to-start cost.

### P5.33-04 — Adopted upper UI

Integrate the approved toolbar and explanation surface while preserving the
sidebar/progression surface and clock/audio semantics.

### P5.33-05 — Hardening / acceptance

Run the phase's full regression, responsive, accessibility, security and
product-acceptance gates.

Start with **P5.33-00 only** unless explicitly authorized to run the remaining stages.
