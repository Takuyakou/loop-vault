# Contract 03 — Finger Number / Hand Contract

Standard:
1 thumb, 2 index, 3 middle, 4 ring, 5 little.

For pitches low→high:
- RH simultaneous fingers strictly ascend;
- LH simultaneous fingers strictly descend.

Left-hand Voicing mode is LH-only.
Other modes expose hand selection only where their actual resolver supports it.

Integrated mode lock:

- Source MIDI / Custom have one exact pitch set and no stored hand split; the
  user may designate that unchanged set as R or L for a suggestion.
- Basic Shell / Basic Full / Full Shell use only the resolver's existing
  `rightHandNotes` or `leftHandNotes`; an empty side is unavailable for that
  event and must not be synthesized.
- Left-hand uses its actual lesson target set as L only.
- P5.31 separate slash Bass reference is not a fingering target.
