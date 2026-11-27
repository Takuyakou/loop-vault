# Phase 4.6-LOG Label Correction Log Contract

## Purpose

The Label Correction Log measures which chord families users accept or correct during real saves. It is a local research-priority signal, not Fixed Gold and not direct Product-promotion evidence.

## Recording boundary

Records are built only after a Vault save or append succeeds. A logging failure is caught independently and never changes the successful Vault operation.

Each saved source event records:

- accepted rank 1
- selected rank 2 or rank 3
- manual input
- reverted edit
- deleted event

`staleEdit` explicitly distinguishes stale editing contexts. The timestamp is supplied by the UI boundary; the domain builder does not read the clock.

## Local format

- format: JSONL
- location: AppData `loopvault/label-corrections.jsonl`
- schema version: 1
- duplicate key: event fingerprint + final label + edit type + stale state
- controls: opt-out, JSONL export and clear
- external transmission: none

Malformed pre-existing lines do not block appending a new valid record. Duplicate records in the existing file or one append batch are not written again.

## Privacy

Stored:

- analyzer version and mode
- hashed event identity and note-snapshot token
- detected, displayed and final chord labels
- canonical component diff
- confidence, edit type, stale state and timestamp

Never stored:

- MIDI bytes
- song title
- absolute path or source file name
- Idea title or memo
- personal identifiers

The note snapshot field is a privacy-safe fingerprint of source fingerprint, segment and displayed harmonic evidence. It is not a recoverable MIDI note dump.

## Research threshold

- minimum: 100 saved events and 20 progressions
- recommended: 200-300 saved events

Counts guide which family should be researched next. They cannot replace independent Gold evaluation.

## Invariants

Product Analyzer, rank, Timeline, Vault schema, `fileVersion = 1` and `defaultAnalyzerMode = phase4-v1` are unchanged.
