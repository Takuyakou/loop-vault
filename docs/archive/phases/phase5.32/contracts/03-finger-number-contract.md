# Contract 03 — Finger Number / Hand Contract

Standard:
1 thumb, 2 index, 3 middle, 4 ring, 5 little.

For pitches low→high:
- RH simultaneous fingers strictly ascend;
- LH simultaneous fingers strictly descend.

Left-hand Voicing mode is LH-only.
Hand is not a user-selectable voicing property. The UI displays every actual,
non-empty hand group in the resolved performance plan.

Integrated mode lock:

- Source MIDI / Custom never alter their exact saved pitch set. When the saved
  voicing has an exact bassNote role, that pitch is shown as L and the
  remaining exact pitches as R. Without a saved Bass role, the unchanged exact
  set is shown as R only; the UI does not invent a split.
- Basic Shell / Basic Full / Full Shell use only the resolver's existing
  `rightHandNotes` or `leftHandNotes`; an empty side is unavailable for that
  event and must not be synthesized.
- Left-hand uses its actual lesson target set as L only.
- P5.31 separate slash Bass reference is not a fingering target.
