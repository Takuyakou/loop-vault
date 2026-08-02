import { z } from "zod";
import { generateRhythmExercise, type RhythmPracticeAttempt, type RhythmPracticeExercise, type RhythmPracticeSession } from "../../domain";

const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
const hintLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const difficultySchema = z.object({ noteCount: z.number().int().min(1).max(16), phraseLengthBeats: z.number().finite().positive(), tempo: z.number().finite().positive(), pitchSpanSemitones: z.number().finite().nonnegative(), degreeComplexity: z.number().finite().nonnegative(), rhythmComplexity: z.number().finite().nonnegative(), positionShift: z.number().finite().nonnegative(), listenLimit: z.number().int().positive(), hintAvailability: hintLevelSchema, transferDistance: z.number().finite().nonnegative() }).strict();
const eventSchema = z.object({ index: z.number().int().nonnegative(), startBeat: z.number().finite().nonnegative(), durationBeats: z.number().finite().positive(), velocity: z.number().finite().min(0).max(1), accent: z.boolean() }).strict();
const snapshotSchema = z.object({ generatorVersion: z.string().min(1), seed: z.string().min(1), vocabularyId: z.enum(["quarter", "eighth", "offbeat-eighth", "rest-start", "dotted-eighth-sixteenth", "sixteenth-syncopation", "tied-duration", "anticipation", "two-beat-cell", "one-bar-cell"]), tempo: z.number().int().min(30).max(240), meter: z.object({ numerator: z.union([z.literal(3), z.literal(4), z.literal(6)]), denominator: z.union([z.literal(4), z.literal(8)]) }).strict(), phraseBars: z.union([z.literal(1), z.literal(2)]), startPositionBeats: z.number().finite().nonnegative(), countInBars: z.union([z.literal(1), z.literal(2)]), listenLimit: z.number().int().min(1).max(4) }).strict();
export const rhythmExerciseSchema: z.ZodType<RhythmPracticeExercise> = z.object({ id: z.string().min(1), version: z.literal(1), generatorVersion: z.string().min(1), seed: z.string().min(1), mode: z.literal("rhythm"), source: z.object({ kind: z.literal("generated") }).strict(), tempo: z.number().int().min(30).max(240), meter: z.object({ numerator: z.union([z.literal(3), z.literal(4), z.literal(6)]), denominator: z.union([z.literal(4), z.literal(8)]) }).strict(), targetEvents: z.array(eventSchema).min(1).max(16), difficulty: difficultySchema, hints: z.array(z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), kind: z.enum(["tempo-meter", "start-position", "rhythm-syllables", "full-rhythm-grid"]) }).strict()), generatorSnapshot: snapshotSchema }).strict();
export const rhythmAttemptSchema: z.ZodType<RhythmPracticeAttempt> = z.object({ id: z.string().min(1), sessionId: z.string().min(1), startedAt: z.string().datetime(), completedAt: z.string().datetime(), listenCount: z.number().int().positive(), hintLevel: hintLevelSchema, rating: ratingSchema, mainIssue: z.enum(["rhythm", "duration", "recall"]).optional(), independentSuccess: z.boolean(), transferOfAttemptId: z.string().min(1).optional(), exerciseSnapshot: rhythmExerciseSchema }).strict();
export const rhythmSessionSchema: z.ZodType<RhythmPracticeSession> = z.object({ id: z.string().min(1), startedAt: z.string().datetime(), completedAt: z.string().datetime().optional(), targetCount: z.number().int().positive(), completedCount: z.number().int().nonnegative(), mode: z.literal("rhythm"), attemptIds: z.array(z.string().min(1)), abandoned: z.boolean() }).strict();

export function isCanonicalRhythmAttempt(attempt: RhythmPracticeAttempt): boolean {
  const generated = generateRhythmExercise(attempt.exerciseSnapshot.generatorSnapshot);
  return generated.ok && JSON.stringify(generated.exercise) === JSON.stringify(attempt.exerciseSnapshot);
}

export function rhythmIndependentSuccess(attempt: Pick<RhythmPracticeAttempt, "rating" | "hintLevel">): boolean {
  return (attempt.rating === "good" || attempt.rating === "easy") && attempt.hintLevel <= 2;
}
