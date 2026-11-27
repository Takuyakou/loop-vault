# Contract 08 — Accessibility and Responsive Behavior

Required gates:

- keyboard-only route/use;
- visible focus for timeline cards, checkbox, transport, voicing/display controls;
- card accessible name includes progression position, chord label, duration, and audition intent where practical;
- `お手本音` is a real labeled checkbox/control with programmatic state;
- current timeline event exposes state semantically without relying on size/color alone;
- 320 px viewport remains usable;
- effective 200% scaling remains usable;
- no page-level horizontal overflow; timeline-local scrolling is allowed;
- `prefers-reduced-motion` respected for optional transition/scroll effects;
- axe serious/critical = 0 on focused flows.

The moving playhead is supplementary. Current chord/beat/position must remain available as text/semantic UI.
