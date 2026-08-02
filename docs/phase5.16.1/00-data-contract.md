# Phase 5.16.1 Data Contract

## Boundary

Practice data is a separate, versioned repository. It must not be added to `VaultFile`, `SongIdea`, `SavedProgressionBlock`, or the Vault `fileVersion: 1` schema. Phase 5.16.1 persists generated Degree Echo exercises only; Vault-backed sources, Rhythm Echo, and Bassline Echo are invalid input.

## Canonical domain types

Names may be adapted to repository conventions, but meanings and invariants are locked.

```ts
type BassPracticeMode = "degree";
type PracticeRating = "again" | "hard" | "good" | "easy";
type PracticeIssue = "pitch" | "rhythm" | "duration" | "recall" | "fretboard";
type HintLevel = 0 | 1 | 2 | 3 | 4;
type Handedness = "right" | "left";
type StringCount = 4 | 5;
type SingingReferenceMode = "auto" | "original" | "octave-1" | "octave-2";

interface DegreeValue {
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  accidental: -1 | 0 | 1;
  octave: number;
}

interface PracticeTargetEvent {
  index: number;
  degree: DegreeValue;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

interface PracticeDifficulty {
  noteCount: number;
  phraseLengthBeats: number;
  tempo: number;
  pitchSpanSemitones: number;
  degreeComplexity: number;
  rhythmComplexity: number;
  positionShift: number;
  listenLimit: number;
  hintAvailability: HintLevel;
  transferDistance: number;
}

interface GeneratorSnapshot {
  generatorVersion: string;
  seed: string;
  key: string;
  scale: "major" | "minor";
  allowedDegrees: DegreeValue[];
  noteCount: number;
  phraseLengthBeats: number;
  tempo: number;
  pitchSpan: { minMidi: number; maxMidi: number };
  instrument: "bass";
  tuning: number[];
  fretRange: { min: number; max: number };
  handedness: Handedness;
  rhythmPreset: string;
  singingReferenceMode: SingingReferenceMode;
  maxAttempts: number;
}

interface SingingReference {
  mode: SingingReferenceMode;
  resolvedOctaveShift: 0 | 1 | 2;
  events: PracticeTargetEvent[];
}

interface PracticeExercise {
  id: string;
  version: 1;
  generatorVersion: string;
  seed: string;
  mode: BassPracticeMode;
  source: { kind: "generated" };
  tonalContext: { key: string; scale: "major" | "minor" };
  tempo: number;
  meter: { numerator: number; denominator: number };
  targetEvents: PracticeTargetEvent[];
  difficulty: PracticeDifficulty;
  hints: Array<{ level: Exclude<HintLevel, 0>; kind: string }>;
  singingReference: SingingReference;
  generatorSnapshot: GeneratorSnapshot;
}

interface PracticeAttempt {
  id: string;
  exerciseId: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  listenCount: number;
  hintLevel: HintLevel;
  singSkipped: boolean;
  singGateCompleted: boolean;
  responseLatencyMs?: number;
  rating?: PracticeRating;
  mainIssue?: PracticeIssue;
  independentSuccess: boolean;
  transferOfAttemptId?: string;
  exerciseSnapshot: PracticeExercise;
}

interface PracticeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  targetCount: number;
  completedCount: number;
  mode: BassPracticeMode;
  attemptIds: string[];
  abandoned: boolean;
}

interface ReviewQueueItem {
  exerciseId: string;
  dueAt: string;
  reason: "again" | "hard" | "good" | "easy" | "transfer";
  difficultyAdjustment: -1 | 0 | 1;
  sourceAttemptId: string;
  stableOrder: number;
}

interface PracticeSettings {
  version: 1;
  singEnabled: boolean;
  singingReferenceMode: SingingReferenceMode;
  stringCount: StringCount;
  handedness: Handedness;
  fretRange: { min: number; max: number };
  sessionTargetCount: number;
}
```

## Feature flag authority

The only enablement authority is the external application feature flag
`enableBassPracticeDegreeEcho`, whose default is OFF. Enablement is not a
Practice setting and is never persisted in `PracticeFileV1`.

- Application composition checks the flag before creating, loading, or
  subscribing to the Practice Repository.
- The repository does not import, read, infer, or override the feature flag.
- Domain and repository APIs do not accept an `enabled` field.
- Flag OFF means zero repository operations, zero file creation, zero audio
  initialization, and zero Practice keyboard/timer registration.
- Persisted data cannot turn the product feature ON.

## Repository envelope

```ts
interface PracticeFileV1 {
  app: "loopvault-practice";
  fileVersion: 1;
  settings: PracticeSettings;
  exercises: PracticeExercise[];
  attempts: PracticeAttempt[];
  sessions: PracticeSession[];
  reviewQueue: ReviewQueueItem[];
  updatedAt: string;
}
```

The schema is strict at every persisted object boundary. Unknown top-level fields are rejected or handled only by an explicit migration. `fileVersion > 1` must never be rewritten by an older app. Invalid JSON is quarantined, not replaced with an empty file.

## Invariants

### Generation

- `targetEvents.length` is 1–6 and equals `difficulty.noteCount` and snapshot `noteCount`.
- Events are ordered by `(startBeat, index)`, monophonic, non-overlapping, finite, and within one bar.
- MIDI note is an integer 0–127 and playable on the configured tuning/fret range.
- Exercise ID is derived from generator version plus a canonical hash of seed and normalized settings; it does not depend on current time or absolute path.
- Generator retries are capped by `maxAttempts`; exhaustion returns a typed error and writes nothing.
- Same snapshot produces the same exercise, hints, fretboard solutions, playback events, and singing reference.

### Singing reference

- Reference event count, startBeat, duration, velocity, degree sequence, contour, and interval classes match target events.
- Only octave displacement may differ from the bass answer.
- `original` shift is 0, `octave-1` is 1, `octave-2` is 2, and `auto` resolves deterministically to 0–2.
- The resolved shift is persisted with the attempt snapshot.

### Attempt honesty

`independentSuccess` is a canonical derived field, never accepted as a UI
decision:

```ts
const independentSuccess =
  (rating === "good" || rating === "easy") &&
  hintLevel <= 2 &&
  !singSkipped &&
  singGateCompleted;
```

- Again/Hard always produce false.
- Hint 3/4 always produce false.
- Skip always produces false without converting the attempt to an error.
- Completion requires a rating; abandoned attempts may omit rating/completedAt.
- `transferOfAttemptId` must reference an earlier completed Good/Easy attempt in the same logical exercise lineage.

Write and load rules:

- Attempt construction computes the field with the canonical derivation.
- Before serialization, repository validation recomputes the value. A caller
  supplied mismatch rejects the write transaction and preserves the prior file.
- On load, schema validation recomputes the value for every persisted attempt.
  A mismatch rejects that attempt from active data and places it in the Practice
  quarantine with a stable record index and issue code.
- A quarantined mismatch cannot contribute to Home, History, queue, transfer,
  or session completion summaries.
- Load must not silently replace a mismatched persisted value and accept the
  record, because that would hide corruption or an incompatible derivation.

### Queue

- Queue policy has an explicit version in implementation.
- Derivation input is completed attempt history plus a supplied clock date; it must not read `Date.now()` internally.
- Stable sort key is `(dueAt, stableOrder, exerciseId, sourceAttemptId)`.
- Same normalized history and clock date produces the same queue.
- Again schedules 2–3 items later with difficulty down; Hard schedules session tail/next head with tempo down; Good schedules next session/day with variation; Easy schedules 2–3 days later with transfer preference.
- Duplicate queue items for the same source attempt/reason are rejected.

## Persistence paths

Tauri AppData relative paths:

```text
loopvault/practice-v1.json
loopvault/practice-v1.json.tmp
loopvault/practice-backups/practice-YYYYMMDD-HHMMSS-NNNNNN.json
loopvault/practice-v1.corrupt-YYYYMMDD-HHMMSS-NNNNNN.json
```

`NNNNNN` is a zero-padded monotonic sequence selected after listing existing
files for the same timestamp. Creation uses no-overwrite semantics; an existing
name is never replaced. Repository single-flight serialization prevents local
races, and the storage adapter must fail rather than overwrite if a collision is
still observed. Backup rotation is bounded to the newest 20 valid backup names,
ordered by parsed timestamp then sequence. Corrupt files are isolated with the
same collision-free rule and are not counted as backups.

These paths contain no user-selected path or filename. A test/browser adapter is injected behind the same repository interface and must not be mistaken for the Tauri durability guarantee.

## Save transaction

1. Validate and canonicalize a complete in-memory snapshot.
2. Serialize UTF-8 JSON with stable field order where defined and a trailing newline.
3. Ensure only approved AppData-relative paths are used; reject absolute paths and traversal.
4. Write the full snapshot to the temporary path.
5. Close the write before rename; use the platform adapter's strongest available flush contract.
6. Preserve or create a bounded backup of the last valid committed file.
7. Atomically rename temporary to committed path.
8. Mark the corresponding in-memory revision saved only after rename succeeds.
9. Remove stale temporary data only after classifying it; never promote it silently.

Concurrent saves are serialized by revision. If revision N completes after N+1 was requested, N must not clear the unsaved state for N+1. A write, backup, or rename failure preserves the prior committed file and active in-memory session and returns a typed error.

## Load and recovery

- A missing file creates an empty v1 repository only when the application has
  already enabled the external flag and invoked repository initialization; the
  repository itself never evaluates the flag.
- Valid v1 loads and is normalized without changing semantic IDs.
- Invalid JSON is renamed to the corrupt path and reported; app startup and Vault load continue.
- Schema-invalid records are either quarantined with indexes/issues or the entire Practice file is isolated. They never enter Vault quarantine.
- Future version enters Practice read-only/recovery state; it is never overwritten.
- A selected valid backup can restore through the same validated save transaction.
- Source deletion does not delete historical attempts because each attempt contains the minimal generated exercise snapshot.

## Retention and derived views

- History consumes session summaries derived from repository data, not a second event log.
- Home consumes a derived due summary and next focus.
- Derived functions are pure and locale-independent; localization happens in UI.
- 1,000 attempts must be summarized or paginated. The repository may retain attempts, but UI may not eagerly mount all records.
- Backup count must be bounded; initial contract follows the existing Vault repository maximum of 20 unless a measured reason changes it.

## Data minimization

Persist:

- generated exercise and generator snapshot
- attempt/session metadata
- rating and optional self-reported issue
- hint/listen/singing/transfer facts
- deterministic review schedule
- settings needed to reproduce the exercise

Never persist:

- raw MIDI or MIDI bytes
- audio or recording data
- microphone/camera input
- absolute paths
- personal or full source filenames
- Vault content copied into Practice data
- analyzer result, confidence, or automatic score
- crash reports containing the full exercise event sequence

## Feature flag lifecycle

When OFF, the repository is not initialized and no empty file is created. Enabling loads Practice data independently after Vault startup. Disabling during an active session first stops playback, cancels dwell/timers/listeners, attempts to preserve the in-memory revision, and returns to Chord Dojo without mutating Vault.

## Required tests

- strict schema, defaults, canonical serialization, future version
- first run, reload, backup restore, corruption isolation
- two backup/corrupt operations in the same second produce distinct names,
  never overwrite prior evidence, and rotate backups deterministically
- temp-write then rename operation order
- write/rename failure preserves prior file and unsaved session
- concurrent saves serialize and retain latest revision
- no absolute path, traversal, MIDI/audio/filename fields
- independentSuccess truth table
- persisted independentSuccess mismatch is rejected on write and quarantined on
  load without contributing to derived summaries
- queue determinism and tie-breaks
- transfer reference integrity
- external `enableBassPracticeDegreeEcho` default OFF performs zero repository
  operations and cannot be overridden by persisted data
- Vault schema snapshot and `fileVersion: 1` remain unchanged
