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
- Status: CAUSE CONFIRMED (P5.36); **Family A presentation fix DEFAULT ON (P5.38)**; **Family B identity fix DEFAULT ON (P5.37)**; **P5.39 Family C research CLOSED with `PROMOTION = FAIL`**, production blocker remains open
- Observed facts (USER-REPORTED — not reproducible from committed repo alone):
  - meter metadata reads 1/4 (privacy-safe PPQ metadata);
  - approximately 65 quarter-note beats;
  - resulting progression of approximately 65 cells;
  - excessive empty cells;
  - small onset jitter;
  - instances where the actual pitch collection does not match the reported label.
- Bad outcome: a clean, structured chord progression is reported as a different, more complex chord family.
- Expected semantic behavior: the reported chord family should match the sounding pitches.
- Earlier hypotheses (onset clustering window, note-on-centric analysis, re-strike handling) are superseded by the confirmed causes below; do not reopen them without new evidence.
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
  known issue; neither the P5.37 identity fix nor the P5.38 presentation fix
  addresses them.

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

### Implemented fix (P5.38 — presentation grouping, DEFAULT ON)

A separate, runtime-only presentation projection now runs after the resolved
`fullTimeline` and after the P5.37 Family B correction. The promoted
`p538-presentation-grouping-shadow-v2` policy groups fragmented source-meter
cells into variable-duration harmonic presentation spans without rewriting
meter or harmonic identity.

- Flag `enablePresentationGrouping`: omitted / `true` → promoted projection
  (DEFAULT ON); `false` → exact-legacy presentation.
- Presentation consumers: formatted progression, candidate-card summaries, and
  visible candidate-card block topology/count.
- Source truth remains: meter, `totalBars`, timeline bar/beat, persisted chord
  events/source coordinates, export, `SongMiniMap`, and `ProgressionGrid`.
- No projection or policy id is persisted; Vault schema, `fileVersion`, and
  migration state are unchanged.
- Privacy-safe aggregate: 65/40/10 legacy groups/dashes/blocks becomes 25/0/8,
  with harmonic identity, source truth, and source candidates unchanged.
- Full history: `docs/phase5.38/reports/` (see `P5.38-05-closeout.md`).

### Relationship to current source-preserving building blocks

Existing source-preserving building blocks include per-chord `sourceVoicing`
(pitch/octave) and selected-bass `Source Bassline` capture (exact beats, 4/4).
They do **not**, by themselves, establish a general exact full-polyphonic
source-performance preservation path. LF-MIDI-001 Families A and B are closed
by their separate default-on fixes. Family C was studied in P5.39 but was not
promoted: its final `SUSPICIOUS = 1` is a local harmonic identity/ranking
mismatch after a necessary temporal split. The separate follow-up research
boundary is in [`P5.39-closeout.md`](../phase5.39/P5.39-closeout.md).

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

- `1/4` source meter is the confirmed upstream condition for Family A's
  downstream presentation fragmentation; it is not the cause of Family B's
  harmonic-identity misread.
- Keep Family A presentation, Family B identity, and Family C representability
  separate in diagnosis and claims.
- Do not rewrite source meter to obtain presentation grouping, and do not claim
  Families A/B fixes resolve Family C.

---

# Chord Dojo findings (P16-00 audit)

Found while auditing Chord Dojo for the ear-practice phase (P16). **Not fixed by P16**: the ear practice works
around each of them inside its own code (`src/domain/earPractice/`) and leaves Chord Dojo as it is. Details and
measurements: `docs/reports/P16-00-audit.md`. Priority is the human's call.

## LF-DOJO-001 — `judge: 'core'` can never pass `7alt`

- Status: OPEN (observed)
- `buildPracticeChordRequirements` has no tones for an altered chord: `allowedPitchClasses` is empty (the voicing
  helper `chordPitchClasses` returns `[]` for `altered`), so every note, the required 3rd and ♭7th included,
  is reported as 「余分な音」. No set of notes passes.
- A `7alt` in a standard or saved progression may therefore be impossible to play in today's Dojo.
  Check how this relates to TXT-JAZZ (which keeps 7alt up to the practice).
- Workaround in the ear practice: `7alt` is judged as a set of note names (`judge: 'pitchset'`).

## LF-DOJO-002 — `judge: 'core'` does not require the major 7th of mMaj7

- Status: OPEN (observed)
- `seventhIntervals` has no entry for `minMaj7`; the root and the minor 3rd alone pass. The major 7th is optional.
- Workaround in the ear practice: after `core` passes, mMaj7 also needs the major 7th.

## LF-DOJO-003 — `accidentalPreferenceForKey` spells minor keys wrongly and ♭ chords with sharps

- Status: OPEN (observed)
- It decides from the tonic alone and knows only major-key tonics: `"D minor"` and `"G minor"` come out as sharp keys.
  In a sharp key every chord is spelled with sharps, so a ♭VI in D major reads `A#maj7` (B♭maj7 is meant).
- Workaround in the ear practice: flats for a ♭ degree, sharps for a ♯ degree, the key's habit otherwise (a minor key follows its relative major).

## LF-DOJO-004 — The release gate watches pedal-sustained notes

- Status: OPEN (observed)
- `releaseGate` in `ChordDojoView` uses `soundingNotes` (held + sustained). With the damper pedal down, the next
  card cannot start after all keys are released.

## LF-DOJO-005 — `ChordEntry` counts keys, not note names, and judges a chord that is still being built

- Status: OPEN (observed)
- It answers once the number of held keys reaches the number of required note names, `settleMs` (60 ms) after the
  last key. Building a chord one note at a time (100 ms apart) is judged half way (Cmaj7 as C E G → 「B がありません」);
  C2 C3 E3 counts as three notes though it is two names.
- Workaround in the ear practice: its own answer-taking (`earEntry`, Stage 02).

## LF-DOJO-006 — `collect.ts` reads the bar length from the numerator only

- Status: OPEN (observed)
- `Number(timeSignature.split('/')[0])` is used as the beats per bar, so x/8 meters get the wrong bar length
  (and 1/4 makes every beat a bar). Do not rewrite the stored meter (LF-MIDI-001).
- Workaround in the ear practice: only `x/4` (x of 2…12) and unwritten meters are asked; the rest are counted and shown as not available.

## LF-DOJO-007 — `spellMidi` does not know mMaj7 (or 7alt), so the Dojo's staff spells their notes by the key's habit

- Status: OPEN (observed; not fixed)
- `DEGREES` in `targetSnapshot.ts` has no entry for `minMaj7` (and a 7alt carries no tensions to look up). The major 7th
  (and the altered tones) fall back to flats or sharps by the context, so GmMaj7 shows its F♯ as G♭ in a flat context
  (and its B♭ as A♯ in a sharp one), and A♭7alt shows its ♭9 as A and its ♭13 as E instead of B𝄫 and F♭ (checked with
  `targetSnapshot`). This is on the Dojo's staff today (`GrandStaff`).
- Workaround in the ear practice: `degreeSpelledPitch` (`src/domain/earPractice/degreeSpelling.ts`) spells these two chords
  from their degrees before the staff is drawn. `spellMidi` itself is untouched.
