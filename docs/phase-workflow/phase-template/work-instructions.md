<!-- phase-id: 0.0 -->

# Phase 0.0 — Work Instructions (template)

Detailed spec for the phase. The README is the entry point; this file holds the
depth. Replace every section with real content when you copy the template.

## Goal

One paragraph: what the phase delivers and the final acceptance state.

## Scope

What this phase builds. Enumerate concretely.

- Item 1
- Item 2

## Non-goals

What this phase explicitly does not build. Keep out-of-scope work out.

- Non-goal 1
- Non-goal 2

## Contracts

Link to UX / storage / privacy / state-machine contracts under
`contracts/` as they are written. Do not replace existing behaviour with
guesses — audit first.

## Stages

Mirror the stage list in the README, with the detailed work for each stage.

## Definition of Done

The measurable conditions that let a stage — and the phase — be called
complete. Every completed stage must have its required gates recorded as
`pass` and a commit hash before it is marked done in `execution-state.json`.

## Safety

Follow the root `AGENTS.md`. Never auto-merge, never push, never commit private
audio, MIDI, `.local-evaluation`, or personal absolute paths.
