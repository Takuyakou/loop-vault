<!-- phase-id: 5.20 -->
# Contract 01 — Scope / Input

## In scope

- A second **Text** input mode inside the existing Capture route; it is not a
  new route or a new persisted progression type.
- Text parse, canonicalisation, diagnostics, compact cards, key/BPM/meter
  controls, capability evaluation, the existing CaptureDraft workflow, normal
  Vault save, and existing downstream consumers.
- One selected-card Auto Voicing inspector. Custom Voicing is permitted only
  through the existing Live MIDI capture/override path described in Contract 03.

## Authority boundary

Text is authoritative until a successful explicit conversion to a session-only
CaptureDraft. The resulting Draft is authoritative thereafter; no two-way
synchronisation with the text field is allowed.

## Bounded input

Grammar v1 accepts at most 4,096 UTF-16 code units, 12 bars, and 48 chord
tokens. Overflow is a diagnostic and prevents Draft conversion; input is never
silently truncated.

## Out of scope

Composition assistance, PXF, MIDI export, a second storage model, a new Vault
progression type, Vault/Practice schema or fileVersion migration, source-MIDI
voicing reconstruction, a click-to-compose voicing editor, and P5.21 are out
of scope.
