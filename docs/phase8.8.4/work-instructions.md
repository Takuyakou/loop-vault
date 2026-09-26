# Phase 8.8.4 — Work Instructions

## Goal

Unify Standard and Extended Text Capture into one compact score-like workspace, preserving each parser's grammar, the P8.8.2 visual behavior and P8.8.3 defining-tone audition. Add an exact-time, pauseable, seekable Text transport with smooth visual playhead and live BPM changes.

## Scope

Standard/Extended Text Capture presentation, Standard score adapter, Text-only transport interactions, performance and accessibility.

## Non-goals

No chord-theory expansion, MIDI Analyzer change, Vault migration, external-site compatibility expansion, Home/Vault redesign, or next-phase implementation.

## Contract

The [accepted phase contract](contracts/P8.8.4-CONTRACT.md) defines the UI and transport behavior. The current Product UI, parser, persistence and tests outrank a simplified interaction-only mock. No MIDI Analyzer/Extractor, Vault schema, P8.8.3 semantic policy or unrelated product redesign is in scope.

## Execution

Follow the stages listed in [README](README.md), one independently verified commit per stage. Continue through ordinary test failures by isolating and fixing their cause. Stage 07 runs fresh candidate gates and stops at the human-authorized merge gate required by AGENTS.md. After approval, run post-merge gates and create a D-drive raw Windows EXE. Do not advance to Phase 8.9/9.

## Definition of Done

Standard and Extended share one score-like workspace; exact musical-time transport and source-span navigation satisfy the accepted contract; P8.8.3 permanent corpus and all phase gates pass at candidate HEAD. Merge waits for the required human authorization.
