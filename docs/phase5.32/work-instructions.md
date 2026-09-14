<!-- phase-id: 5.32 -->

# Phase 5.32 — Work Instructions

## Goal

Add conservative Suggested Fingering metadata to the exact resolved Voicing
Loop pitches without changing pitches, timing, playback, or scoring semantics.

## Scope

The canonical detailed specification is
[`P5.32-work-instructions.md`](P5.32-work-instructions.md). Git audit establishes
six current modes: Source MIDI, Custom, Basic Shell, Basic Full, Full Shell,
and Left-hand.

## Non-goals

No voicing mutation, hand tracking, correctness score, biometric inference,
Analyzer/MIDI Export change, Vault schema change, or automatic merge/release.

## Contracts

All files under [`contracts/`](contracts/) apply. Stage00 locks the actual
resolver, hand, control-token, UI, and persistence boundaries before product
implementation.

## Stages

- P5.32-00: audit, baseline fixtures, contract lock.
- P5.32-01: pure domain and bounded candidates.
- P5.32-02: deterministic cyclic ranking.
- P5.32-03: UI and optional app-local persistence.
- P5.32-04: integration and product acceptance.

## Definition of Done

Each stage has a verified commit and all required gates recorded as pass in
`execution-state.json`. P5.32-00 changes no production fingering behavior.

## Safety

Follow root `AGENTS.md`. Never commit private MIDI/audio or personal paths and
never merge, push, tag, release, or begin P5.33 automatically.
