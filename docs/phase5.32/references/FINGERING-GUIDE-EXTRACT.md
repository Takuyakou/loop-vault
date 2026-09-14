# Fingering Guide — Extracted Design Rules

Source: user-supplied `piano-chord-fingering-guide.html`.

This is a design extraction, not a substitute for the full source.

## High-confidence principles from the guide

1. **Chord name and hand shape are separate.**
   A chord symbol does not determine the final fingering.

2. **Decision order matters.**
   Determine:
   - playing role,
   - melody/bass responsibility,
   - necessary chord tones,
   - register/voicing,
   - fingering,
   - rhythm.

3. **Voice leading matters.**
   Common tones and small movements are useful anchors.

4. **Starting finger patterns are useful but not universal.**
   The guide presents first-choice triad and 7th/rootless fingerings, then
   explicitly allows changes based on black keys, intervals, next chord, and the
   player's hand.

5. **Test at least the next chord.**
   A fingering that is comfortable in isolation may be poor in progression.

6. **Compare a small number of candidates and record the chosen one.**
   The goal is to stop re-deciding from zero every time.

7. **Common pitch != same finger requirement.**
   Finger substitution on the same physical key is valid.

8. **Thumb on black key is allowed in chords.**
   Do not import scale-thumb-under conventions as an absolute chord rule.

9. **Suggested fingering has uncertainty.**
   The guide rates general principles strongly but personal optimal fingering only
   moderately because the player's actual hand/motion has not been observed.

## Golden first-choice examples

Triads:
- root: RH 1-3-5 / LH 5-3-1
- first inversion: RH 1-2-5 / LH 5-3-1
- second inversion: RH 1-3-5 / LH 5-2-1

7th/rootless examples:
- RH four-note: 1-2-3-5
- LH four-note: 5-3-2-1

Guide-tone shell:
- RH two-note: 1-5

LH three-note shell:
- 5-3-1

## Progression example

Dm9 → G13 → Cmaj9:

```text
RH
Dm9   F3 A3 C4 E4   1 2 3 5
G13   F3 A3 B3 E4   1 2 3 5
Cmaj9 E3 G3 B3 D4   1 2 3 5
```

The source specifically highlights that Dm9→G13 retains F/A/E while C→B moves
by semitone.

Equivalent LH rootless examples use:

```text
5 3 2 1
```

## 8-chord application fixture

```text
Am9
D13
Gmaj9
Cmaj9
F#m7(b5)
B7(#5)
Em9
E7(#5)
```

Use the exact pitch/finger fixture file in this package for automated tests.

## Scope decision for P5.32

Do not implement Drop 2, quartal, or upper-structure-specific fingering engines
yet. The source describes them as later material.
