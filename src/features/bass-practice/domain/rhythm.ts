import { stableHash } from "./determinism";
import type {
  HintLevel,
  PracticeDifficulty,
  PracticeHint,
  RhythmGeneratorResult,
  RhythmGeneratorSnapshot,
  RhythmMeter,
  RhythmPracticeExercise,
  RhythmTargetEvent,
  RhythmVocabularyId,
} from "./types";

export const RHYTHM_GENERATOR_VERSION = "rhythm-v1";

const CELLS: Readonly<Record<RhythmVocabularyId, readonly Omit<RhythmTargetEvent, "index">[]>> = Object.freeze({
  quarter: freezeCell([[0, 1, true], [1, 1, false], [2, 1, false], [3, 1, false]]),
  eighth: freezeCell([[0, .5, true], [.5, .5, false], [1, .5, false], [1.5, .5, false], [2, .5, false], [2.5, .5, false], [3, .5, false], [3.5, .5, false]]),
  "offbeat-eighth": freezeCell([[0, .5, true], [1.5, .5, false], [2.5, .5, false], [3.5, .5, false]]),
  "rest-start": freezeCell([[.5, .5, false], [1, 1, false], [2.5, .5, false], [3, 1, false]]),
  "dotted-eighth-sixteenth": freezeCell([[0, .75, true], [.75, .25, false], [1.5, .75, false], [2.25, .25, false], [3, 1, false]]),
  "sixteenth-syncopation": freezeCell([[0, .25, true], [.5, .25, false], [1, .25, false], [1.75, .25, false], [2.5, .5, false], [3.25, .25, false]]),
  "tied-duration": freezeCell([[0, 1.5, true], [1.5, .5, false], [2, 2, false]]),
  anticipation: freezeCell([[0, 1, true], [1.5, .5, false], [2, 1, false], [3.5, .5, false]]),
  "two-beat-cell": freezeCell([[0, .5, true], [.5, .5, false], [1.5, .5, false]]),
  "one-bar-cell": freezeCell([[0, 1, true], [1, .5, false], [2, .5, false], [2.5, .5, false], [3, 1, false]]),
});

const RHYTHM_HINTS: readonly PracticeHint[] = Object.freeze([
  Object.freeze({ level: 1, kind: "tempo-meter" }), Object.freeze({ level: 2, kind: "start-position" }),
  Object.freeze({ level: 3, kind: "rhythm-syllables" }), Object.freeze({ level: 4, kind: "full-rhythm-grid" }),
]);

export function rhythmVocabularyIds(): readonly RhythmVocabularyId[] { return Object.freeze(Object.keys(CELLS) as RhythmVocabularyId[]); }
export function buildRhythmHints(maximum: HintLevel): readonly PracticeHint[] { if (!Number.isInteger(maximum) || maximum < 0 || maximum > 4) throw new RangeError("Hint level must be between 0 and 4."); return Object.freeze(RHYTHM_HINTS.filter((hint) => hint.level <= maximum)); }

export function generateRhythmExercise(input: RhythmGeneratorSnapshot): RhythmGeneratorResult {
  const failure = normalize(input);
  if (failure) return Object.freeze({ ok: false, error: Object.freeze({ code: "invalid-config", message: failure, attempts: 0 }) });
  const snapshot = freeze({ ...input, meter: { ...input.meter } });
  const phraseBeats = beatsPerBar(snapshot.meter) * snapshot.phraseBars;
  const events = CELLS[snapshot.vocabularyId].map((event) => ({ ...event, startBeat: event.startBeat + snapshot.startPositionBeats })).filter((event) => event.startBeat < phraseBeats).map((event, index) => freeze({ index, startBeat: event.startBeat, durationBeats: Math.min(event.durationBeats, phraseBeats - event.startBeat), velocity: event.accent ? .88 : .72, accent: event.accent }));
  if (!events.length || events.some((event) => event.durationBeats <= 0)) return Object.freeze({ ok: false, error: Object.freeze({ code: "attempts-exhausted", message: "Rhythm cell does not fit the requested phrase.", attempts: 1 }) });
  const difficulty: PracticeDifficulty = freeze({ noteCount: events.length, phraseLengthBeats: phraseBeats, tempo: snapshot.tempo, pitchSpanSemitones: 0, degreeComplexity: 0, rhythmComplexity: rhythmComplexity(snapshot.vocabularyId), positionShift: 0, listenLimit: snapshot.listenLimit, hintAvailability: 4, transferDistance: Math.max(1, snapshot.startPositionBeats) });
  const exercise: RhythmPracticeExercise = freeze({ id: `rhythm-${stableHash({ generatorVersion: snapshot.generatorVersion, snapshot })}`, version: 1, generatorVersion: snapshot.generatorVersion, seed: snapshot.seed, mode: "rhythm", source: { kind: "generated" }, tempo: snapshot.tempo, meter: snapshot.meter, targetEvents: events, difficulty, hints: buildRhythmHints(4), generatorSnapshot: snapshot });
  return Object.freeze({ ok: true, exercise });
}

export interface RhythmTransferSource { readonly id: string; readonly completedAt?: string; readonly rating?: "again" | "hard" | "good" | "easy"; readonly exerciseSnapshot: RhythmPracticeExercise; }
export type RhythmTransferResult = | { readonly ok: true; readonly sourceAttemptId: string; readonly exercise: RhythmPracticeExercise } | { readonly ok: false; readonly error: { readonly code: "source-not-eligible" | "same-key" | "unplayable-transfer"; readonly message: string } };
export function deriveRhythmTransferExercise(sourceAttempt: RhythmTransferSource, options: { readonly tempo?: number; readonly startPositionBeats?: number }): RhythmTransferResult {
  if (!sourceAttempt.completedAt || (sourceAttempt.rating !== "good" && sourceAttempt.rating !== "easy")) return transferFailure("source-not-eligible", "Transfer requires an earlier completed Good or Easy attempt.");
  const source = sourceAttempt.exerciseSnapshot;
  const snapshot: RhythmGeneratorSnapshot = { ...source.generatorSnapshot, seed: `${source.seed}::transfer::${options.tempo ?? source.tempo}::${options.startPositionBeats ?? source.generatorSnapshot.startPositionBeats}`, tempo: options.tempo ?? source.tempo, startPositionBeats: options.startPositionBeats ?? source.generatorSnapshot.startPositionBeats };
  if (snapshot.tempo === source.tempo && snapshot.startPositionBeats === source.generatorSnapshot.startPositionBeats) return transferFailure("same-key", "Transfer must change tempo or start position.");
  const generated = generateRhythmExercise(snapshot);
  return generated.ok ? Object.freeze({ ok: true, sourceAttemptId: sourceAttempt.id, exercise: generated.exercise }) : transferFailure("unplayable-transfer", generated.error.message);
}

function normalize(snapshot: RhythmGeneratorSnapshot): string | undefined { if (snapshot.generatorVersion.trim().length === 0 || snapshot.generatorVersion.length > 64) return "Generator version must contain 1 to 64 characters."; if (snapshot.seed.length === 0 || snapshot.seed.length > 256) return "Seed must contain 1 to 256 characters."; if (!Object.prototype.hasOwnProperty.call(CELLS, snapshot.vocabularyId)) return "Unsupported rhythm vocabulary."; if (!Number.isInteger(snapshot.tempo) || snapshot.tempo < 30 || snapshot.tempo > 240) return "Tempo must be an integer between 30 and 240 BPM."; if (!isMeter(snapshot.meter)) return "Meter must be 3/4, 4/4, or 6/8."; if (snapshot.phraseBars !== 1 && snapshot.phraseBars !== 2) return "Phrase length must be one or two bars."; if (snapshot.countInBars !== 1 && snapshot.countInBars !== 2) return "Count-in must be one or two bars."; if (!Number.isInteger(snapshot.listenLimit) || snapshot.listenLimit < 1 || snapshot.listenLimit > 4) return "Listen limit must be between 1 and 4."; const phraseBeats = beatsPerBar(snapshot.meter) * snapshot.phraseBars; return !Number.isFinite(snapshot.startPositionBeats) || snapshot.startPositionBeats < 0 || snapshot.startPositionBeats >= phraseBeats ? "Start position must remain within the phrase." : undefined; }
function beatsPerBar(meter: RhythmMeter): number { return meter.numerator; }
function isMeter(meter: RhythmMeter): boolean { return (meter.numerator === 3 && meter.denominator === 4) || (meter.numerator === 4 && meter.denominator === 4) || (meter.numerator === 6 && meter.denominator === 8); }
function rhythmComplexity(id: RhythmVocabularyId): number { return ["quarter", "eighth", "two-beat-cell"].includes(id) ? 1 : ["offbeat-eighth", "rest-start", "tied-duration", "one-bar-cell"].includes(id) ? 2 : 3; }
function transferFailure(code: "source-not-eligible" | "same-key" | "unplayable-transfer", message: string): RhythmTransferResult { return Object.freeze({ ok: false, error: Object.freeze({ code, message }) }); }
function freezeCell(values: readonly [number, number, boolean][]): readonly Omit<RhythmTargetEvent, "index">[] { return Object.freeze(values.map(([startBeat, durationBeats, accent]) => Object.freeze({ startBeat, durationBeats, velocity: accent ? .88 : .72, accent }))); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
