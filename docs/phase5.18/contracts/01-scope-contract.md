<!-- phase-id: 5.18 -->

# Contract 01 — Scope, Honesty, and Rollback

## Locked scope
P5.18 adds Chord Context only to Bassline Echo: a read-only Vault progression
snapshot, a safe selected section, deterministic chord accompaniment, manual
tempo, factual history metadata, and optional reuse of P5.17 Record & Compare.

P5.18-00 changes no production code. It only records the contracts below and
baseline evidence.

## Explicit exclusions
- No new progression generator or source MIDI generation.
- No automatic scoring, pitch/rhythm analysis, microphone feature, DI workflow,
  live monitoring, or performance inference.
- No Vault schema/repository mutation, Analyzer change, MIDI Exporter change,
  P5.15 change, or change to Chord Dojo, Live MIDI, or FreePats assets.

## Source truth and rollback
Vault is the primary source; generated Bassline exercises remain compatible.
The future `enableBassPracticeChordContext` flag defaults to enabled in normal
production builds and may be explicitly disabled through the established local
feature-flag mechanism. Disabling it hides P5.18 UI and side effects without
deleting Practice history or retained takes.