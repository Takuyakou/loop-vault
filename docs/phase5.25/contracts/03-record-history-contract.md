# Contract 03 — Record, History, and Lifecycle

## Record Eligibility

Keep maximum take duration 60,000 ms.

```text
durationMs = actualBars * 4 * 60000 / effectiveBpm
eligible = durationMs <= 60000
```

Count-in is excluded; exact 60 seconds is accepted. Over-limit new recording is
disabled with a factual reason and defensively rejected before recording starts.
Practice, Listen, Play, stop/replay, previously retained takes and their panel,
and History remain available; session does not fail. The existing Keep cap stays
as a defensive backstop.

## History

- Keep schema v1 and persistent shape.
- Requested validates `1 | 2 | 4 | 8`; actual validates integer 1..8.
- Preserve existing 1/2 records unchanged.
- Store source reference/signature and facts only; never copy source notes.
- Reopen only against exact logical source and snapshot signature.

## Lifecycle

Source changes preserve requested, reset start to 1, and recompute actual.
Restart and rapid source/window/level changes never reuse stale target, Record
eligibility, playback schedule, or History facts. Missing/deleted sources retain
existing safe unavailable behavior.

## Async Preference Ordering

Preference persistence uses monotonically increasing generations. Rollback is
allowed only when the failed generation still represents the current visible
selection. Any stale success or failure is ignored for UI rollback and must not
replace newer persisted intent. Tests cover rapid 4->8 selection with both save
completion orders and success/failure combinations.
