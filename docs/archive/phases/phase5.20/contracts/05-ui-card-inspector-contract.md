<!-- phase-id: 5.20 -->
# Contract 05 — UI / Compact Cards / Inspector

The interaction order is **input → cards → capability → Draft**. P5.20 reuses
the existing Capture/ProgressionGrid and progression-detail visual language;
it does not create oversized parallel cards.

- Input is first and retains examples, grammar help, key state, BPM, and meter.
- Cards are compact, bar-grouped, selectable, keyboard reachable, and show only
  identity, bar/beat/duration, degree when key is confirmed, and voicing state.
- Token/card diagnostics are visible and linked to the source input. Invalid
  items cannot be silently converted.
- Selected-card detail belongs in a compact Voicing Inspector: canonical chord,
  Auto/Custom provenance, generated or captured notes, reusable mini keyboard
  where available, audition, and the conditional existing Live MIDI capture.
- At 320 CSS pixels and at effective 200% zoom, controls retain one predictable
  reading order without horizontal overflow. Keyboard focus and reduced-motion
  behavior reuse the established Capture components.
