<!-- phase-id: 5.30 -->

# Phase 5.30 — Voicing Loop Polish & Extended Text Progressions

## Status

- **Status:** in_progress
- **Active stage:** P5.30-03
- **Completed stages:** P5.30-00, P5.30-01, P5.30-02
- **Base:** `15b1ed8222105abb0b57c3e19c0ecdc912dc9476`
- **Branch:** `feat/p530-voicing-loop-polish`
- **Next action:** implement P5.30-03 audio interactions

## Purpose

Extend bounded Text Progression Entry to 32 bars / 128 chord tokens and finish
the already-approved compact Voicing Loop presentation and reference-audio
interactions without changing P5.29 timing, Vault schema, or voicing semantics.

## Required Reading Order

1. [Root AGENTS.md](../../AGENTS.md)
2. [Root CLAUDE.md](../../CLAUDE.md)
3. [Work instructions](work-instructions.md)
4. [Execution state](execution-state.json)
5. [Scope and non-goals](contracts/01-scope-and-non-goals.md)
6. [Text capacity](contracts/02-text-progression-capacity.md)
7. [Layout and timeline](contracts/03-voicing-loop-layout-timeline.md)
8. [Playhead and single clock](contracts/04-playhead-clock.md)
9. [Card audition](contracts/05-card-audition.md)
10. [Reference sound](contracts/06-reference-sound.md)
11. [Audio lifecycle](contracts/07-audio-lifecycle.md)
12. [Accessibility and responsive behavior](contracts/08-accessibility-responsive.md)
13. [Protected surfaces](contracts/09-regression-protected-surfaces.md)
14. [Automated acceptance](contracts/10-automated-acceptance.md)
15. [P5.29 baseline](references/P5.29-BASELINE.md)
16. [UI skill requirement](references/UI-SKILL.md)
17. [Approved Voicing Loop mock](references/p5.30-approved-voicing-loop-mock.html)
18. [Design summary](P5.30-design.md)
19. [Reports](reports/README.md)

## Stages

### P5.30-00 — Repository / baseline / audio-path audit

Audit only. Confirm the P5.29 ancestry, Text limits and persistence seam,
single clock, current layout, resolver/audio ownership, tests and exact planned
files. Do not change product behavior.

### P5.30-01 — Text Progression capacity

Raise the bounded parser, Draft, save and UI envelope to 32 bars, 128 chord
tokens and 8192 UTF-16 code units while preserving the exact 1/2/4 grammar.

### P5.30-02 — Compact layout and playhead

Apply the approved vertical order, fixed-geometry scrollable timeline and cyan
playhead as a projection of the existing P5.29 clock.

### P5.30-03 — Audio interactions

Add card audition and session-local reference sound by extending the existing
resolver and Tone Transport ownership; do not add another clock or generator.

### P5.30-04 — Hardening and product acceptance

Run the required focused, related, accessibility, lifecycle, build and hygiene
gates. Stop for human acceptance without merging or pushing.

## Non-goals

No comping/groove engine, arbitrary rhythm grammar, analyzer/generator change,
scoring system, Vault migration, Chord Dojo/Bass Practice redesign, release,
merge, or push.
