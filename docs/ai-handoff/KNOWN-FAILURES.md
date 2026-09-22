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
- Status: CAUSE CONFIRMED (P5.36); **Family-B production fix IMPLEMENTED, PROMOTED, HARDENED, DEFAULT ON (P5.37)**; Family A (meter-derived downstream fragmentation) and vocabulary/representability remain **separate open work**
- Observed facts (USER-REPORTED — not reproducible from committed repo alone):
  - meter metadata reads 1/4 (privacy-safe PPQ metadata);
  - approximately 65 quarter-note beats;
  - resulting progression of approximately 65 cells;
  - excessive empty cells;
  - small onset jitter;
  - instances where the actual pitch collection does not match the reported label.
- Bad outcome: a clean, structured chord progression is reported as a different, more complex chord family.
- Expected semantic behavior: the reported chord family should match the sounding pitches.
- Current hypotheses (HISTORICAL — superseded by the P5.36 confirmed cause below; do not reopen without new evidence):
  - meter-driven segmentation;
  - onset clustering window;
  - bass / upper temporal association;
  - note-on-centric analysis;
  - re-strike handling;
  - chord candidate ranking / pitch explanation.
- Required next experiment (HISTORICAL — run in P5.36-02/03): compare the same input under:
  - A. original meter metadata;
  - B. meter metadata only rewritten to 4/4;
  - C. meter-independent harmonic segmentation;
  - D. C + onset clustering tolerance.
- Evidence: an approved ignored-local fixture is available (git-ignored; only anonymous aggregates are ever tracked).
- Privacy note: no real MIDI names, paths, or full note dumps are recorded here.

### Confirmed cause (P5.34–P5.36)

Two independent, co-occurring causes (see `docs/phase5.36/reports/` and
`docs/phase5.35/reports/`):

- **Family A — CONFIRMED:** `1/4 meter → beatsPerBar = 1 → downstream bar/block/
  formatted-text fragmentation` (~65 cells). A formatting/structure effect only.
- **Family B — CONFIRMED (the wrong-root/broad-slash mislabel):** the fixed 2-beat
  evidence window unions two distinct local harmonic states into one histogram, so
  a chimera / broad / wrong-root slash candidate wins on evidence that neither beat
  supports. On the private fixture's 4 targets: union-only winner 4/4, wrong root
  wins neither beat 4/4, support spans both beats 4/4; `Am11/B` → first-beat vs
  second-beat split restores a coherent `Bm7` (Case B: the bass is correct for the
  later state; the wrong root is the union artifact; the valid bass is reinterpreted
  as a slash).
- **Rejected as primary cause (do not reopen without new evidence):** meter
  metadata → chord identity (NOT SUPPORTED — P5.36-02: identity invariant to a
  diagnostic 4/4 view); carried-in sustain (REJECTED — P5.35); bass extraction
  (REJECTED — Case B); simple note density (REJECTED — P5.36-01); candidate
  generation (REJECTED for observed real cases — the candidate set is constant).
- **Separate family:** vocabulary/representability limits (S02/S04) are a distinct
  known issue; the P5.37 fix does not address them.

### Implemented fix (P5.37 — union-chimera partition, DEFAULT ON)

The P5.24/P5.26 local-state engine could not be reused (its bar-period model and
per-cell evidence gate are 4/4-dependent — P5.37-01). Instead, a bounded,
oracle-free **union-chimera partition** was added at the candidate-ranking layer:
`src/domain/midi/unionChimera.ts` (shared pure trigger, frozen policy v1,
`minBucketPcs = 3`) is called from `analyzeMidiWithRankingScores` in
`src/domain/midi/legacy.ts` (`partitionUnionChimeras`), between per-window ranking
and `smoothTimelineWithRankingScores`. A fixed 2-beat window whose top-1 candidate
is supported by neither beat (two materially different coherent local harmonies
merged) is split into its two beats' coherent candidates before smoothing, ranked
with the **existing** vocabulary/scorer; coherent windows are left byte-for-byte
unchanged. The source meter fact is preserved (no 1/4→4/4 rewrite).

- Flag `enableUnionChimeraPartition`: omitted / `true` → the promoted fix (DEFAULT
  ON); `false` → exact-legacy rollback (retained, test-locked).
- Promotion PASS (P5.37-02), production-integrated (P5.37-03), hardened (P5.37-05),
  DEFAULT-ON APPROVED (P5.37-05a), closed out (P5.37-06).
- On the private fixture: 4/4 known targets improve; `Am11/B`, `Fm11/G` are removed
  from the corrected final timeline and do not reappear after smoothing.
- Full history: `docs/phase5.37/reports/` (see `P5.37-06-closeout.md`).

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
