# Contract 04 — Key-aware Surface Spelling

Spelling changes surface names, not pitch-class identity.

Use:
key-aware + chord/interval-aware spelling.

Do not use:
"sharp key => no flats".

E major key signature:
F# C# G# D#.

Required target examples:
- Ab7-like root identity in E context -> G#7
- E/Ab-like slash identity in E context -> E/G#

Unknown key preserves legacy fallback unless current repository already defines a safer contract.

If spelling requires migration/canonical identity rewrite, stop and report.
