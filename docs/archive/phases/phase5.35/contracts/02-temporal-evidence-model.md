# Contract 02 — Temporal Evidence Model

## Purpose

Classify pitch contributions by harmonic relevance, not note age.

## Inputs

Use current-code evidence where available:

- pitch / pitch class;
- start/end time;
- overlap with current and neighboring windows;
- attack relation;
- duration;
- voice/bass role;
- neighboring harmonic evidence;
- existing metric position evidence;
- previous/next candidate context if safely available.

Do not mutate source notes.

## Required conceptual roles

| Role | Meaning |
|---|---|
| CURRENT_ATTACK | newly attacked evidence plausibly belonging to current state |
| CURRENT_SUSTAIN | sustained evidence still supported as current harmony |
| COMMON_TONE | pitch shared across adjacent states |
| CARRIED_IN_SUSTAIN | prior-state overlap weakly supported by current state |
| STRUCTURAL_BASS | strong bass-role evidence |
| SHORT_TRANSIENT | brief/ornamental evidence |
| UNCERTAIN | insufficient evidence |

## Prohibited complete rules

Do not define:

```text
onset before window == carryover
onset inside window == current
```

as sufficient classifiers.

## Hard negatives

### Held harmony

A chord attacks before the current window, no new harmony starts, and the chord sustains through the current window.

Required: core tones stay strong enough to preserve that harmony.

### Common tone

A tone shared between previous/current harmony must not be discarded because it began earlier.

### Positive contamination case

Previous-harmony incompatible tones briefly sustain into a current Bm7-like state while current Bm7 tones are present.

Expected shadow direction: incompatible carryover reduced; Bm7 defining evidence and common tones preserved.
