# Contract 08 — Fail-closed Diagnostics

Never partially reinterpret a failed bar.

Diagnostics must identify at least:

- line/bar;
- offending text or safe abbreviated token;
- category:
  - unrecognized chord,
  - ambiguous compact split,
  - unsupported 3-cell bar,
  - invalid `%`,
  - invalid `=`,
  - unsupported Lesson Left-hand rule.

Same normalized chord + same reason may aggregate:

```text
Am11/B ×2 — Left-hand未対応
```

Different reasons must not be merged.

Do not leak file paths, raw MIDI, device IDs, or private source content into
committed reports/logs.
