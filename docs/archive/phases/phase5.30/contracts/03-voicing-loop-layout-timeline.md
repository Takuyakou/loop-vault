# Contract 03 — Voicing Loop Layout and Timeline

## Approved structure

Use `references/p5.30-approved-voicing-loop-mock.html` as the visual/interaction reference, but implement with production components/tokens rather than copying mock-only code.

Required order:

1. MY VOICINGS / LESSON controls + DISPLAY Learn/Recall
2. CURRENT / NEXT
3. progression timeline
4. chord detail + keyboard
5. transport

NEXT is informational only; do not place Learn/Recall controls inside the NEXT card.

## Fixed card geometry — hard invariant

Timeline cards must remain the existing slim style.

For the same viewport/theme:

`width(current) == width(inactive) == width(audition) == width(focused)`

and

`height(current) == height(inactive) == height(audition) == height(focused)`.

Current state may change border/background/text accent only. No flex-grow, scale transform, padding/font-size, min-height, or other state-driven geometry changes.

Duration must not change card width. Use compact duration metadata and playhead traversal speed.

## Long progressions

- timeline may scroll horizontally inside its own viewport;
- the page itself must not gain unintended horizontal overflow;
- active event is auto-revealed as needed without changing card size;
- avoid smooth auto-scroll when `prefers-reduced-motion` is set;
- 32-bar / 128-event stress case must remain usable and bounded.
