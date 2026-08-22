# Contract 02 — Candidate Grouping

Grouping is presentation-only and uses inclusive bar intervals.

- Relation: overlap coefficient ≥ .75 AND min(start/end/center distance) ≤ 2 bars. IoU is diagnostic only.
- Anchor order: earlier start → later end → stable ID.
- Group only candidates directly related to the fixed anchor; never transitively expand.
- Representative: longest → score → earlier start/end → ID.
- Selected variant: finite `selectionScore` (fallback to `confidence` when absent/non-finite) → higher `confidence` → earlier start → shorter length → earlier end → stable ID.
- `flatten(groups)` must preserve the exact input ID multiset, each reachable once.
- Exact visible labels: JA `<length>小節 · Bar <start>–<end>`; EN `<length> bars · Bars <start>–<end>`.
- Exact accessible names: JA `候補グループ <g>、バリアント <v>。<length>小節、Bar <start>–<end>`; EN `Candidate group <g>, variant <v>. <length> bars, Bars <start>–<end>`.

Representative and selected variant are separate concepts.
