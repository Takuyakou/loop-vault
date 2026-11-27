# Contract 05 — Accessibility / Interaction

Preserve the audited range keyboard contract:
- Left/Right moves; Shift resizes end; Alt+Shift resizes start.
- G cycles snap; Shift+G reverses.
- Space previews/stops; Enter enters editing; Escape restores committed pending range and leaves selection.
- Ctrl/Cmd+Z and redo remain available.

Variant controls require visible focus, keyboard activation, and no color-only meaning. Exact unique ARIA names are JA `候補グループ <g>、バリアント <v>。<length>小節、Bar <start>–<end>` and EN `Candidate group <g>, variant <v>. <length> bars, Bars <start>–<end>`. Focus/highlight must not mutate selection.

Stage03 verifies 320px, effective 200%, reduced motion, horizontal/page scroll usability, long labels, and Axe serious/critical 0. The current minimap has no explicit zoom model; do not invent a zoom contract in Stage01.
