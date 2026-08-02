import { DEGREE_GENERATOR_VERSION } from "./constants";
import { createSeededRandom, stableHash } from "./determinism";
import { buildDegreeHints } from "./hints";
import {
  canonicalKeyName,
  degreeSemitoneOffset,
  degreeToPitchClass,
  keyPitchClass,
  playableMidiNotesForPitchClass,
} from "./mapping";
import { resolveSingingReference } from "./singingReference";
import {
  degreeVocabulary,
  isConstrainedChromaticApproach,
  isDegreeVocabularyId,
  vocabularyMatchesSequence,
} from "./vocabulary";
import type {
  DegreeValue,
  GeneratorError,
  GeneratorResult,
  GeneratorSnapshot,
  PracticeDifficulty,
  PracticeExercise,
  PracticeTargetEvent,
} from "./types";

export function generateDegreeExercise(
  input: GeneratorSnapshot,
): GeneratorResult {
  const normalized = normalizeSnapshot(input);
  if (!normalized.ok) return normalized;
  const snapshot = normalized.snapshot;
  const tonicPitchClass = keyPitchClass(snapshot.key, snapshot.scale);
  if (tonicPitchClass === undefined) {
    return invalidConfig(`Unsupported ${snapshot.scale} key: ${snapshot.key}`);
  }

  for (let attempt = 0; attempt < snapshot.maxAttempts; attempt += 1) {
    const random = createSeededRandom(`${snapshot.seed}\u0000${attempt}`);
    const events = generateEvents(snapshot, tonicPitchClass, random.integer);
    if (!events) continue;
    try {
      const difficulty = difficultyFromSnapshot(snapshot);
      const exercise = deepFreeze<PracticeExercise>({
        id: `degree-${stableHash({
          generatorVersion: snapshot.generatorVersion,
          snapshot,
        })}`,
        version: 1,
        generatorVersion: snapshot.generatorVersion,
        seed: snapshot.seed,
        mode: "degree",
        source: { kind: "generated" },
        tonalContext: { key: snapshot.key, scale: snapshot.scale },
        tempo: snapshot.tempo,
        meter: { numerator: 4, denominator: 4 },
        targetEvents: events,
        difficulty,
        hints: buildDegreeHints(difficulty.hintAvailability),
        singingReference: resolveSingingReference(
          events,
          snapshot.singingReferenceMode,
        ),
        generatorSnapshot: snapshot,
      });
      return Object.freeze({ ok: true, exercise });
    } catch (error) {
      return invalidConfig(error instanceof Error ? error.message : "Invalid generator config.");
    }
  }

  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: "attempts-exhausted",
      message: `Unable to generate a playable exercise in ${snapshot.maxAttempts} attempts.`,
      attempts: snapshot.maxAttempts,
    }),
  });
}

export function normalizeGeneratorSnapshot(
  input: GeneratorSnapshot,
): GeneratorSnapshot {
  const result = normalizeSnapshot(input);
  if (!result.ok) throw new RangeError(result.error.message);
  return result.snapshot;
}

type NormalizeResult =
  | { readonly ok: true; readonly snapshot: GeneratorSnapshot }
  | { readonly ok: false; readonly error: GeneratorError };

function normalizeSnapshot(input: GeneratorSnapshot): NormalizeResult {
  if (input.scale !== "major" && input.scale !== "minor") {
    return invalidConfig(`Unsupported scale: ${String(input.scale)}`);
  }
  const key = canonicalKeyName(input.key, input.scale);
  if (!key) return invalidConfig(`Unsupported ${input.scale} key: ${input.key}`);
  if (input.generatorVersion.trim().length === 0 || input.generatorVersion.length > 64) {
    return invalidConfig("Generator version must contain 1 to 64 characters.");
  }
  if (input.seed.length === 0 || input.seed.length > 256) {
    return invalidConfig("Seed must contain 1 to 256 characters.");
  }
  if (!Number.isInteger(input.noteCount) || input.noteCount < 1 || input.noteCount > 6) {
    return invalidConfig("Note count must be an integer between 1 and 6.");
  }
  if (
    !Number.isFinite(input.phraseLengthBeats)
    || input.phraseLengthBeats < 1
    || input.phraseLengthBeats > 4
  ) {
    return invalidConfig("Phrase length must be between 1 and 4 beats.");
  }
  if (!Number.isInteger(input.tempo) || input.tempo < 30 || input.tempo > 240) {
    return invalidConfig("Tempo must be an integer between 30 and 240 BPM.");
  }
  if (
    !Number.isInteger(input.pitchSpan.minMidi)
    || !Number.isInteger(input.pitchSpan.maxMidi)
    || input.pitchSpan.minMidi < 0
    || input.pitchSpan.maxMidi > 127
    || input.pitchSpan.maxMidi < input.pitchSpan.minMidi
  ) {
    return invalidConfig("Pitch span must be ordered MIDI integers between 0 and 127.");
  }
  if (
    input.tuning.length !== 4
    && input.tuning.length !== 5
  ) {
    return invalidConfig("Bass tuning must contain four or five strings.");
  }
  if (input.tuning.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) {
    return invalidConfig("Tuning notes must be MIDI integers between 0 and 127.");
  }
  if (
    !Number.isInteger(input.fretRange.min)
    || !Number.isInteger(input.fretRange.max)
    || input.fretRange.min < 0
    || input.fretRange.max > 36
    || input.fretRange.max < input.fretRange.min
  ) {
    return invalidConfig("Fret range must be ordered integers between 0 and 36.");
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10_000) {
    return invalidConfig("Max attempts must be an integer between 1 and 10000.");
  }
  if (input.allowedDegrees.length === 0 || input.allowedDegrees.length > 32) {
    return invalidConfig("Allowed degrees must contain 1 to 32 values.");
  }
  if (input.allowedDegrees.some((value) => !isDegreeValue(value))) {
    return invalidConfig("Allowed degrees contain an invalid degree value.");
  }
  if (!isDegreeVocabularyId(String(input.vocabularyId))) {
    return invalidConfig(`Unsupported degree vocabulary: ${String(input.vocabularyId)}`);
  }
  if (input.degreeSequence.length !== input.noteCount) {
    return invalidConfig("Degree sequence length must equal note count.");
  }
  if (input.degreeSequence.some((value) => !isDegreeValue(value))) {
    return invalidConfig("Degree sequence contains an invalid degree value.");
  }
  if (!vocabularyMatchesSequence(input.vocabularyId, input.degreeSequence)) {
    return invalidConfig("Degree sequence does not match the selected vocabulary ID.");
  }
  const vocabulary = degreeVocabulary(input.vocabularyId);
  if (!isConstrainedChromaticApproach(vocabulary)) {
    return invalidConfig("Chromatic approaches must resolve by semitone to degree 1, 3, or 5.");
  }
  if (input.degreeSequence.some((value) => !input.allowedDegrees.some(
    (allowed) => compareDegrees(value, allowed) === 0,
  ))) {
    return invalidConfig("Degree sequence must be contained by allowed degrees.");
  }
  if (input.instrument !== "bass" || input.rhythmPreset !== "even") {
    return invalidConfig("Only bass with the even rhythm preset is supported.");
  }
  if (input.handedness !== "left" && input.handedness !== "right") {
    return invalidConfig("Handedness must be left or right.");
  }
  if (!["auto", "original", "octave-1", "octave-2"].includes(input.singingReferenceMode)) {
    return invalidConfig("Singing reference mode is unsupported.");
  }

  const allowedDegrees = [...input.allowedDegrees]
    .map((value) => Object.freeze({ ...value }))
    .sort(compareDegrees);
  const deduplicatedDegrees = allowedDegrees.filter((value, index) => (
    index === 0 || compareDegrees(value, allowedDegrees[index - 1]) !== 0
  ));
  return {
    ok: true,
    snapshot: deepFreeze({
      generatorVersion: input.generatorVersion.trim(),
      seed: input.seed,
      key,
      scale: input.scale,
      allowedDegrees: deduplicatedDegrees,
      vocabularyId: input.vocabularyId,
      degreeSequence: input.degreeSequence.map((value) => Object.freeze({ ...value })),
      noteCount: input.noteCount,
      phraseLengthBeats: input.phraseLengthBeats,
      tempo: input.tempo,
      pitchSpan: { ...input.pitchSpan },
      instrument: "bass",
      tuning: [...input.tuning],
      fretRange: { ...input.fretRange },
      handedness: input.handedness,
      rhythmPreset: "even",
      singingReferenceMode: input.singingReferenceMode,
      maxAttempts: input.maxAttempts,
    }),
  };
}

function generateEvents(
  snapshot: GeneratorSnapshot,
  tonicPitchClass: number,
  randomInteger: (minimum: number, maximumInclusive: number) => number,
): readonly PracticeTargetEvent[] | undefined {
  const events: PracticeTargetEvent[] = [];
  const durationBeats = snapshot.phraseLengthBeats / snapshot.noteCount;
  let phraseTonicMidi: number | undefined;
  for (let index = 0; index < snapshot.noteCount; index += 1) {
    const degree = snapshot.degreeSequence[index];
    const pitchClass = degreeToPitchClass(tonicPitchClass, degree);
    let candidates = playableMidiNotesForPitchClass(
      pitchClass,
      snapshot.tuning,
      snapshot.fretRange,
      snapshot.pitchSpan,
    );
    if (phraseTonicMidi !== undefined) {
      const absoluteTarget = phraseTonicMidi
        + degreeSemitoneOffset(degree);
      candidates = candidates.filter((note) => note === absoluteTarget);
      if (candidates.length === 0) return undefined;
    }
    if (candidates.length === 0) return undefined;
    const midiNote = candidates[randomInteger(0, candidates.length - 1)];
    if (phraseTonicMidi === undefined) {
      phraseTonicMidi = midiNote - degreeSemitoneOffset(degree);
    }
    events.push(Object.freeze({
      index,
      degree: Object.freeze({ ...degree }),
      midiNote,
      startBeat: index * durationBeats,
      durationBeats,
      velocity: 0.82,
    }));
  }
  return Object.freeze(events);
}

function difficultyFromSnapshot(snapshot: GeneratorSnapshot): PracticeDifficulty {
  const accidentalCount = snapshot.allowedDegrees.filter(
    (value) => value.accidental !== 0,
  ).length;
  return deepFreeze({
    noteCount: snapshot.noteCount,
    phraseLengthBeats: snapshot.phraseLengthBeats,
    tempo: snapshot.tempo,
    pitchSpanSemitones: snapshot.pitchSpan.maxMidi - snapshot.pitchSpan.minMidi,
    degreeComplexity: Math.min(3, Math.ceil(snapshot.allowedDegrees.length / 3) + (accidentalCount > 0 ? 1 : 0)),
    rhythmComplexity: 1,
    positionShift: snapshot.fretRange.max - snapshot.fretRange.min > 12 ? 1 : 0,
    listenLimit: snapshot.noteCount >= 6 ? 2 : snapshot.noteCount >= 4 ? 3 : 4,
    hintAvailability: 4,
    transferDistance: snapshot.allowedDegrees.length >= 7 ? 5 : 2,
  });
}

function isDegreeValue(value: DegreeValue): boolean {
  return Number.isInteger(value.degree)
    && value.degree >= 1
    && value.degree <= 7
    && [-1, 0, 1].includes(value.accidental)
    && Number.isInteger(value.octave)
    && value.octave >= -2
    && value.octave <= 2;
}

function compareDegrees(left: DegreeValue, right: DegreeValue): number {
  return left.octave - right.octave
    || left.degree - right.degree
    || left.accidental - right.accidental;
}

function invalidConfig(message: string): Extract<GeneratorResult, { readonly ok: false }> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code: "invalid-config", message, attempts: 0 }),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export { DEGREE_GENERATOR_VERSION };
