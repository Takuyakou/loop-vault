<!-- phase-id: 5.29 -->

# Phase 5.29 — Work Instructions

## Goal

Confirm and strengthen Voicing Loop chord-change timing for 4/4 progressions
containing one, two, or four chords per bar. Preserve actual event durations
through Text Parse, Draft, Vault Save/reload, and Practice.

## Scope

- One chord per bar: four beats.
- Two chords per bar: two plus two beats.
- Four chords per bar: one beat each.
- Canonical fixture: | Cmaj9 | Am9 Dm9 | G13 | Cmaj9 | with durations 4,2,2,4,4.
- Current, Next, Beat, position, playback and Loop count share the existing clock.
- Pause/Resume, Restart and BPM changes preserve musical timing semantics.
- Basic Shell, Basic Full, Left-hand, Source MIDI and Custom share event timing.
- Minimal progression-strip metadata if partial-bar durations are not clear.

## Non-goals

Comping Pattern, Hold/Rest/Re-strike, Swing, Bossa accompaniment, analyzer,
voicing generator, Vault schema/fileVersion, migration and practice persistence
redesign are outside scope.

## Contracts

[Harmonic rhythm contract](contracts/01-harmonic-rhythm-contract.md) inherits
P5.27 single-clock and P5.28 detached-source lifecycle behavior.

## Stages

P5.29-00 audits and locks the contract. P5.29-01 strengthens the existing seams
and minimal presentation. P5.29-02 runs fresh focused acceptance and closes
the phase. Each stage remains an independent commit.

## Definition of Done

The canonical fixture survives actual Vault persistence without four-beat
rounding. Mixed 1/2/4-bar events and every voicing selection use identical starts
and durations. Existing clock and playback regression remain green. Required
focused tests, TypeScript, lint, browser regression and hygiene gates pass with
an exact tested candidate hash.

## Safety

Follow root AGENTS.md. Do not merge or push. Do not commit private media,
personal paths or generated build/test output.
