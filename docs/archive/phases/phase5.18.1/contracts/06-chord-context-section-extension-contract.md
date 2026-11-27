<!-- phase-id: 5.18.1 -->

# Contract 06 — Chord Context Section-Length Extension

## Authority

This is the explicit P5.18.1 amendment authorized by the human on 2026-08-09.
It supersedes the historical one/two-bar P5.18 section limit only for work
implemented by P5.18.1. Historical P5.18 documents remain an accurate record
of their original scope.

## Supported section sizes

Only complete, contiguous 4/4 sections of these exact lengths are supported:

- 1 bar / 4 beats (legacy)
- 2 bars / 8 beats (legacy)
- 4 bars / 16 beats
- 8 bars / 32 beats
- 12 bars / 48 beats

No arbitrary intermediate length is introduced. A section must contain at most
48 chord-onset events, and each event must remain inside the selected section.

## Behavioural guarantees

- Existing one/two-bar generated and Vault snapshots remain valid and deterministic.
- Named preset forms are never clipped, substituted, or implicitly divided.
- Vault selection remains read-only and retains the existing safe snapshot boundary; no raw MIDI, source path, or Vault mutation is introduced.
- The same snapshot signature, section, BPM, meter, layer mode, and seed must produce the same exercise and accompaniment plan.
- Start, replacement, cancellation, route leave, tab change, and natural completion must release all accompaniment resources. Long sections must not block the UI, fabricate a completion result, or prevent cancellation.

## Required implementation evidence

Later stages must add coverage for generated and Vault snapshots at 4, 8, and
12 bars; legacy 1/2-bar non-regression; deterministic generation/playback;
bounded event count; cancellation/replacement; and selected-section factual
History. P5.18.1-05 must include production and Tauri acceptance of a 12-bar
section.

## Non-goals

This amendment does not add arbitrary-duration playback, a new accompaniment
engine, a new bassline generator, a Vault schema change, or a Vault mutation.
