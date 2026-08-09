export type BassPracticeMode = "degree" | "rhythm";

export type PracticeRating = "again" | "hard" | "good" | "easy";

export type PracticeIssue =
  | "pitch"
  | "rhythm"
  | "duration"
  | "recall"
  | "fretboard";

export type HintLevel = 0 | 1 | 2 | 3 | 4;
export type Handedness = "right" | "left";
export type StringCount = 4 | 5;
export type ScaleMode = "major" | "minor";
export type DegreeVocabularyId =
  | "tonic-single"
  | "tonic-dominant"
  | "tonic-dominant-octave"
  | "minor-color-cadence"
  | "tonic-dominant-mixolydian"
  | "ascending-minor-color"
  | "dominant-octave-resolution"
  | "chromatic-approach-1"
  | "chromatic-approach-3"
  | "chromatic-approach-5";
export type SingingReferenceMode =
  | "auto"
  | "original"
  | "octave-1"
  | "octave-2";

export interface DegreeValue {
  readonly degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly accidental: -1 | 0 | 1;
  readonly octave: number;
}

export interface PracticeTargetEvent {
  readonly index: number;
  readonly degree: DegreeValue;
  readonly midiNote: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
}

export interface PracticeDifficulty {
  readonly noteCount: number;
  readonly phraseLengthBeats: number;
  readonly tempo: number;
  readonly pitchSpanSemitones: number;
  readonly degreeComplexity: number;
  readonly rhythmComplexity: number;
  readonly positionShift: number;
  readonly listenLimit: number;
  readonly hintAvailability: HintLevel;
  readonly transferDistance: number;
}

export interface GeneratorSnapshot {
  readonly generatorVersion: string;
  readonly seed: string;
  readonly key: string;
  readonly scale: ScaleMode;
  readonly allowedDegrees: readonly DegreeValue[];
  readonly vocabularyId: DegreeVocabularyId;
  readonly degreeSequence: readonly DegreeValue[];
  readonly noteCount: number;
  readonly phraseLengthBeats: number;
  readonly tempo: number;
  readonly pitchSpan: {
    readonly minMidi: number;
    readonly maxMidi: number;
  };
  readonly instrument: "bass";
  readonly tuning: readonly number[];
  readonly fretRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly handedness: Handedness;
  readonly rhythmPreset: "even";
  readonly singingReferenceMode: SingingReferenceMode;
  readonly maxAttempts: number;
}

export interface PracticeHint {
  readonly level: Exclude<HintLevel, 0>;
  readonly kind:
    | "tonal-context"
    | "note-count-contour"
    | "degree-sequence"
    | "note-names-fretboard"
    | "tempo-meter"
    | "start-position"
    | "rhythm-syllables"
    | "full-rhythm-grid";
}

export interface SingingReference {
  readonly mode: SingingReferenceMode;
  readonly resolvedOctaveShift: 0 | 1 | 2;
  readonly events: readonly PracticeTargetEvent[];
}

export interface DegreePracticeExercise {
  readonly id: string;
  readonly version: 1;
  readonly generatorVersion: string;
  readonly seed: string;
  readonly mode: BassPracticeMode;
  readonly source: { readonly kind: "generated" };
  readonly tonalContext: {
    readonly key: string;
    readonly scale: ScaleMode;
  };
  readonly tempo: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly targetEvents: readonly PracticeTargetEvent[];
  readonly difficulty: PracticeDifficulty;
  readonly hints: readonly PracticeHint[];
  readonly singingReference: SingingReference;
  readonly generatorSnapshot: GeneratorSnapshot;
}

export interface PracticeAttempt {
  readonly id: string;
  readonly exerciseId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly listenCount: number;
  readonly hintLevel: HintLevel;
  readonly singSkipped: boolean;
  readonly singGateCompleted: boolean;
  readonly responseLatencyMs?: number;
  readonly rating?: PracticeRating;
  readonly mainIssue?: PracticeIssue;
  readonly independentSuccess: boolean;
  readonly transferOfAttemptId?: string;
  readonly reviewQueueClaimId?: string;
  readonly exerciseSnapshot: PracticeExercise;
}

export interface PracticeSession {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly targetCount: number;
  readonly completedCount: number;
  readonly mode: BassPracticeMode;
  readonly attemptIds: readonly string[];
  readonly abandoned: boolean;
}

export interface PracticeSettings {
  readonly version: 1;
  readonly singEnabled: boolean;
  readonly singingReferenceMode: SingingReferenceMode;
  readonly stringCount: StringCount;
  readonly handedness: Handedness;
  readonly fretRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly sessionTargetCount: number;
  /** Additive preference; omitted legacy files use the compatible two-note chain. */
  readonly rootMotionNoteCount?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export interface ReviewQueueItem {
  readonly exerciseId: string;
  readonly dueAt: string;
  readonly reason: PracticeRating | "transfer";
  readonly difficultyAdjustment: -1 | 0 | 1;
  readonly sourceAttemptId: string;
  readonly stableOrder: number;
  readonly schedule: ReviewSchedule;
  readonly claim?: {
    readonly id: string;
    readonly sessionId: string;
    readonly claimedAt: string;
    readonly exercise: PracticeExercise;
  };
}

export type ReviewSchedule =
  | {
      readonly kind: "current-session-offset";
      readonly questionsLater: 2 | 3;
      readonly tempoMultiplier: 1;
    }
  | {
      readonly kind: "session-boundary";
      readonly position: "tail-or-next-head";
      readonly tempoMultiplier: 0.9;
    }
  | {
      readonly kind: "variation";
      readonly timing: "next-session-or-next-day";
      readonly variation: "different-key";
      readonly tempoMultiplier: 1;
    }
  | {
      readonly kind: "spaced-transfer";
      readonly intervalDays: 3;
      readonly preferTransfer: true;
      readonly tempoMultiplier: 1;
    };

export interface FretboardPosition {
  /** Zero-based index in the supplied tuning, from lowest to highest string. */
  readonly stringIndex: number;
  readonly fret: number;
  readonly midiNote: number;
}

export type GeneratorErrorCode =
  | "invalid-config"
  | "attempts-exhausted";

export interface GeneratorError {
  readonly code: GeneratorErrorCode;
  readonly message: string;
  readonly attempts: number;
}


export type RhythmVocabularyId =
  | "quarter"
  | "eighth"
  | "offbeat-eighth"
  | "rest-start"
  | "dotted-eighth-sixteenth"
  | "sixteenth-syncopation"
  | "tied-duration"
  | "anticipation"
  | "two-beat-cell"
  | "one-bar-cell";

export interface RhythmMeter {
  readonly numerator: 3 | 4 | 6;
  readonly denominator: 4 | 8;
}

export interface RhythmTargetEvent {
  readonly index: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
  readonly accent: boolean;
}

export interface RhythmGeneratorSnapshot {
  readonly generatorVersion: string;
  readonly seed: string;
  readonly vocabularyId: RhythmVocabularyId;
  readonly tempo: number;
  readonly meter: RhythmMeter;
  readonly phraseBars: 1 | 2;
  readonly startPositionBeats: number;
  readonly countInBars: 1 | 2;
  readonly listenLimit: number;
}

export interface RhythmPracticeExercise {
  readonly id: string;
  readonly version: 1;
  readonly generatorVersion: string;
  readonly seed: string;
  readonly mode: "rhythm";
  readonly source: { readonly kind: "generated" };
  readonly tempo: number;
  readonly meter: RhythmMeter;
  readonly targetEvents: readonly RhythmTargetEvent[];
  readonly difficulty: PracticeDifficulty;
  readonly hints: readonly PracticeHint[];
  readonly generatorSnapshot: RhythmGeneratorSnapshot;
}

export type PracticeExercise = DegreePracticeExercise;

export interface RhythmGeneratorError {
  readonly code: GeneratorErrorCode;
  readonly message: string;
  readonly attempts: number;
}

export type RhythmGeneratorResult =
  | { readonly ok: true; readonly exercise: RhythmPracticeExercise }
  | { readonly ok: false; readonly error: RhythmGeneratorError };
export type GeneratorResult =
  | { readonly ok: true; readonly exercise: DegreePracticeExercise }
  | { readonly ok: false; readonly error: GeneratorError };

export type TransferErrorCode =
  | "source-not-eligible"
  | "same-key"
  | "unsupported-key"
  | "unplayable-transfer";

export interface TransferError {
  readonly code: TransferErrorCode;
  readonly message: string;
}

export type TransferResult =
  | {
      readonly ok: true;
      readonly sourceAttemptId: string;
      readonly exercise: PracticeExercise;
    }
  | { readonly ok: false; readonly error: TransferError };

export interface RhythmPracticeAttempt {
  readonly id: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly listenCount: number;
  readonly hintLevel: HintLevel;
  readonly rating: PracticeRating;
  readonly mainIssue?: Extract<PracticeIssue, "rhythm" | "duration" | "recall">;
  readonly independentSuccess: boolean;
  readonly transferOfAttemptId?: string;
  readonly exerciseSnapshot: RhythmPracticeExercise;
}

export interface RhythmPracticeSession {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly targetCount: number;
  readonly completedCount: number;
  readonly mode: "rhythm";
  readonly attemptIds: readonly string[];
  readonly abandoned: boolean;
}

export type BasslineLevel = 1 | 2 | 3;
export interface BasslineChord { readonly root: number; readonly bass?: number; readonly label: string; readonly startBeat: number; readonly durationBeats: number; }
export interface BasslineGeneratorSnapshot { readonly generatorVersion: string; readonly seed: string; readonly source: "generated" | "vault" | "preset"; readonly level: BasslineLevel; readonly tempo: number; readonly meter: { readonly numerator: 4; readonly denominator: 4 }; readonly key: string; readonly chords: readonly BasslineChord[]; readonly sourceReferenceId?: string; readonly sourceLabel?: string; readonly sourcePresetId?: string; readonly sourceCatalogVersion?: string; }
export interface BasslineTargetEvent { readonly index: number; readonly midiNote: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number; readonly chordIndex: number; }
export interface BasslinePracticeExercise { readonly id: string; readonly version: 1; readonly generatorVersion: string; readonly seed: string; readonly mode: "bassline"; readonly source: { readonly kind: "generated" | "vault" | "preset"; readonly referenceId?: string; readonly label?: string; readonly presetId?: string; readonly catalogVersion?: string }; readonly tempo: number; readonly meter: { readonly numerator: 4; readonly denominator: 4 }; readonly targetEvents: readonly BasslineTargetEvent[]; readonly chords: readonly BasslineChord[]; readonly difficulty: PracticeDifficulty; readonly hints: readonly PracticeHint[]; readonly generatorSnapshot: BasslineGeneratorSnapshot; }
export type BasslineGeneratorResult = { readonly ok: true; readonly exercise: BasslinePracticeExercise } | { readonly ok: false; readonly error: { readonly code: GeneratorErrorCode; readonly message: string; readonly attempts: number } };