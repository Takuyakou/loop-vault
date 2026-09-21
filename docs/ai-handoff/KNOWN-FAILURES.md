# Loop Vault — Known Failures

When to read:
Read before modifying MIDI import, the analyzer, or chord ranking.

Do not preload:
Not needed for non-MIDI tasks.

Failures are anonymous: no real MIDI file names, no absolute paths, no full
note dumps. Synthetic pitch examples are allowed.

---

## LF-MIDI-001 — Clean structured chord MIDI may be degraded by analyzer interpretation

- ID: LF-MIDI-001
- Status: OPEN (cause undetermined)
- Observed facts (USER-REPORTED — not reproducible from committed repo alone):
  - meter metadata reads 1/4 (privacy-safe PPQ metadata);
  - approximately 65 quarter-note beats;
  - resulting progression of approximately 65 cells;
  - excessive empty cells;
  - small onset jitter;
  - instances where the actual pitch collection does not match the reported label.
- Bad outcome: a clean, structured chord progression is reported as a different, more complex chord family.
- Expected semantic behavior: the reported chord family should match the sounding pitches.
- Current hypotheses:
  - meter-driven segmentation;
  - onset clustering window;
  - bass / upper temporal association;
  - note-on-centric analysis;
  - re-strike handling;
  - chord candidate ranking / pitch explanation.
- Required next experiment (not run in Stage 0): compare the same input under:
  - A. original meter metadata;
  - B. meter metadata only rewritten to 4/4;
  - C. meter-independent harmonic segmentation;
  - D. C + onset clustering tolerance.
- Evidence: user report only; no committed fixture yet.
- Privacy note: no real MIDI names, paths, or full note dumps are recorded here.

### Relationship to current source-preserving building blocks

Existing source-preserving building blocks include per-chord `sourceVoicing`
(pitch/octave) and selected-bass `Source Bassline` capture (exact beats, 4/4).
They do **not**, by themselves, establish a general exact full-polyphonic
source-performance preservation path, and they do not resolve the analyzer-based
degradation above (the default analyzer remains `phase4-v1`). Treat LF-MIDI-001
as still open.

### Synthetic semantic examples (privacy-safe)

Example 1:

```text
pitches: B D F# A
expected family: Bm7
observed problematic family: Am11/B
```

Example 2:

```text
pitches: G B Bb Eb F
```

These illustrate "a plain chord reported as a slash / extended chord" without
publishing any real material.

## Cause discipline

- Do not write "1/4 is the root cause" anywhere.
- 1/4 meter is a leading hypothesis only; a chord-identity misread may exist independently.
- Promotion to CONFIRMED requires a reproducible committed fixture + experiment result.
