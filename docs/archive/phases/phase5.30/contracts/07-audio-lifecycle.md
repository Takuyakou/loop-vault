# Contract 07 — Audio Lifecycle and Concurrency

Reuse existing audio ownership/scheduling abstractions. No parallel transport audio engine.

Automated tests must cover:

- reference ON: exactly one scheduled attack per harmonic boundary;
- reference OFF: zero automatic chord attacks;
- count-in: no premature chord before progression start;
- Pause: owned reference notes stop and no hidden clock/audio continues;
- Resume: no duplicate simultaneous attack;
- Restart: stale scheduled notes are cancelled before a fresh count-in/start;
- Stop/Exit/source switch: all owned reference/audition notes/resources cleaned;
- rapid Play/Pause/Restart cycles do not multiply schedulers, notes, click nodes, timers, or listeners;
- manual card audition does not mutate musical transport position;
- changing voicing mode changes subsequent reference/audition pitches through the shared resolver, not timing.

If the current audio infrastructure cannot meet these invariants without a broad redesign, stop and report the blocker rather than improvising a second engine.
