# Contract 03 — Selection Defaults

Current HEAD has no automatic post-analysis Draft. P5.23 computes exactly one selected variant per candidate group, compares every group's selected variant with the Contract 02 selected-variant comparator, and initializes that global winner once, using its whole range and bar snap. The synthetic audit fixture produces group selections `[initial-a, initial-b-8, initial-c]` and must choose `initial-b-8`.

- Focus, hover, highlight, and list opening are not activation.
- Explicit click/Enter activation may change Capture range.
- Existing active Draft and user-changed snap mode are never overwritten.
- Current snap modes/cycle remain bar/harmonic/beat; no preference is persisted at this HEAD.
- Zero candidates retain no automatic Draft and the existing manual fallback.
- Escape/cancel preserves the committed selection.
