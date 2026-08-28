# Contract 02 — Window Domain and Slicing

## Domain

- Requested: exactly `1 | 2 | 4 | 8`.
- Default requested: `2`.
- Actual: every integer 1..8, including final partial 3/5/6/7.
- L1/L2/L3 share requested, start, and actual facts.

## Short Source and Source Switch

Preserve requested and reset `startBar` to 1. For zero-based window index `k`,
navigation is:

```text
startBar = 1 + k * requestedBars
endBar = min(startBar + requestedBars - 1, totalBars)
actualBars = endBar - startBar + 1
           = min(requestedBars, totalBars - startBar + 1)
```

`k` is a nonnegative integer. A window exists only when
`startBar <= totalBars`. At `k = 0`, Previous is unavailable. Next is
unavailable when its computed `nextStartBar = startBar + requestedBars` would
be greater than `totalBars`.

Do not clamp `startBar` backward to create a full overlapping final window.
Never overwrite requested selection with partial actual. History records and
reopens the exact requested/start/actual facts.

## Half-Open Slice

Slice immutable source with `[windowStart, windowEnd)`.

- ending at/before start or starting at/after end: exclude
- crossing start/end: clip to that boundary
- covering the whole window: clip to the whole window
- positive overlap only: include

Rebase included times relative to `windowStart`; preserve pitch/velocity. No
quantization, rounding, or source mutation.

## Projection Order

```text
source snapshot -> crop/rebase -> L3 source or L2/L1 projection
```

Full projection before crop is forbidden. Output is deterministic and snapshot
deep immutability is verified.

Regression covers first/last availability, attempted navigation beyond both
bounds, all partial final lengths, and proof that navigation never overlaps by
backward-clamping a start.
