import { createSeededRandom, stableHash } from "./determinism";
import { fretboardPositions } from "./mapping";
import type { FretboardPosition, Handedness, StringCount } from "./types";

export const ROOT_MOTION_GENERATOR_VERSION = "p5.19-root-motion-v1";
export const ROOT_MOTION_FINGERING_POLICY_VERSION = "root-motion-fingering-v1";
export const ROOT_MOTION_MAX_ATTEMPTS = 32;

export type RootMotionLevel = 1 | 2 | 3 | 4 | 5;
export type RootMotionDirection = "same" | "up" | "down";
export type RootMotionCategory = "same" | "second" | "third" | "fourth" | "tritone" | "fifth";
export type RootMotionAssistance = "independent" | "assisted" | "revealed";
export type RootMotionShapeStringRelation =
  | "same-string"
  | "higher-string-adjacent"
  | "lower-string-adjacent"
  | "skipped-string";

export interface RootMotion {
  readonly direction: RootMotionDirection;
  readonly semitones: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly signedSemitones: -7 | -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly category: RootMotionCategory;
}

export interface RootMotionShape {
  readonly stringRelation: RootMotionShapeStringRelation;
  readonly fretShift: number;
  readonly sameFret: boolean;
}

export interface RootMotionFingeringPair {
  readonly source: FretboardPosition;
  readonly target: FretboardPosition;
  readonly shape: RootMotionShape;
  readonly policyVersion: typeof ROOT_MOTION_FINGERING_POLICY_VERSION;
  readonly tieBreakReason: "fret-shift-then-midrange-then-edge-avoidance-then-lexical";
}

export type RootMotionFingeringResult =
  | { readonly ok: true; readonly pair: RootMotionFingeringPair }
  | { readonly ok: false; readonly error: "unplayable-source-or-target" };

export interface RootMotionTargetEvent {
  readonly index: number;
  readonly midiNote: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly velocity: number;
}

export interface RootMotionGeneratorSnapshot {
  readonly generatorVersion: string;
  readonly seed: string;
  readonly level: RootMotionLevel;
  readonly noteCount: 2 | 3 | 4;
  readonly phraseLengthBeats: 2 | 4 | 6 | 8;
  readonly tempo: number;
  readonly tuning: readonly number[];
  readonly stringCount: StringCount;
  readonly fretRange: { readonly min: number; readonly max: number };
  readonly pitchSpan: { readonly minMidi: number; readonly maxMidi: number };
  readonly handedness: Handedness;
  readonly maxAttempts: typeof ROOT_MOTION_MAX_ATTEMPTS;
}

export type RootMotionSource =
  | { readonly kind: "generated" }
  | {
      readonly kind: "vault-root-path";
      readonly referenceId: string;
      readonly snapshotSignature: string;
      readonly rootPathPolicyVersion: "v1";
    };

export interface RootMotionExercise {
  readonly id: string;
  readonly version: 1;
  readonly generatorVersion: string;
  readonly seed: string;
  readonly mode: "root-motion";
  readonly source: RootMotionSource;
  readonly level: RootMotionLevel;
  readonly tempo: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly targetEvents: readonly RootMotionTargetEvent[];
  readonly motions: readonly RootMotion[];
  readonly fingering: readonly RootMotionFingeringPair[];
  readonly generatorSnapshot: RootMotionGeneratorSnapshot;
}

export type RootMotionGeneratorResult =
  | { readonly ok: true; readonly exercise: RootMotionExercise }
  | { readonly ok: false; readonly error: { readonly code: "invalid-config" | "attempts-exhausted"; readonly message: string; readonly attempts: number } };

const MOTION_WEIGHTS: readonly (readonly [signed: RootMotion["signedSemitones"], weight: number])[] = Object.freeze([
  [0, 2], [-1, 2], [1, 2], [-2, 3], [2, 3], [-3, 2], [3, 2],
  [-4, 2], [4, 2], [-5, 4], [5, 4], [-6, 1], [6, 1], [-7, 4], [7, 4],
]);

export function rootMotionFromSignedSemitones(signedSemitones: number): RootMotion {
  if (!Number.isInteger(signedSemitones) || signedSemitones < -7 || signedSemitones > 7) {
    throw new RangeError("Root Motion semitones must be an integer between -7 and 7.");
  }
  const direction: RootMotionDirection = signedSemitones === 0 ? "same" : signedSemitones > 0 ? "up" : "down";
  const semitones = Math.abs(signedSemitones) as RootMotion["semitones"];
  const category: RootMotionCategory = semitones === 0 ? "same"
    : semitones <= 2 ? "second"
      : semitones <= 4 ? "third"
        : semitones === 5 ? "fourth"
          : semitones === 6 ? "tritone" : "fifth";
  return Object.freeze({ direction, semitones, signedSemitones: signedSemitones as RootMotion["signedSemitones"], category });
}

export function rootMotionWeights(): readonly (readonly [RootMotion["signedSemitones"], number])[] {
  return MOTION_WEIGHTS;
}

export function solveRootMotionFingering(input: {
  readonly sourceMidi: number;
  readonly targetMidi: number;
  readonly tuning: readonly number[];
  readonly fretRange: { readonly min: number; readonly max: number };
}): RootMotionFingeringResult {
  const sources = fretboardPositions(input.sourceMidi, input.tuning, input.fretRange);
  const targets = fretboardPositions(input.targetMidi, input.tuning, input.fretRange);
  if (sources.length === 0 || targets.length === 0) {
    return Object.freeze({ ok: false, error: "unplayable-source-or-target" });
  }
  const midpoint = (input.fretRange.min + input.fretRange.max) / 2;
  const highestString = input.tuning.length - 1;
  const pairs = sources.flatMap((source) => targets.map((target) => ({
    source,
    target,
    fretShift: target.fret - source.fret,
    midpointDistance: Math.abs(source.fret - midpoint) + Math.abs(target.fret - midpoint),
    edgeCount: Number(source.stringIndex === 0 || source.stringIndex === highestString)
      + Number(target.stringIndex === 0 || target.stringIndex === highestString),
  })));
  pairs.sort((left, right) => (
    Math.abs(left.fretShift) - Math.abs(right.fretShift)
    || left.midpointDistance - right.midpointDistance
    || left.edgeCount - right.edgeCount
    || left.source.stringIndex - right.source.stringIndex
    || left.source.fret - right.source.fret
    || left.target.stringIndex - right.target.stringIndex
    || left.target.fret - right.target.fret
  ));
  const best = pairs[0];
  const stringDelta = best.target.stringIndex - best.source.stringIndex;
  const stringRelation: RootMotionShapeStringRelation = stringDelta === 0 ? "same-string"
    : stringDelta === 1 ? "higher-string-adjacent"
      : stringDelta === -1 ? "lower-string-adjacent" : "skipped-string";
  return Object.freeze({
    ok: true,
    pair: Object.freeze({
      source: Object.freeze({ ...best.source }),
      target: Object.freeze({ ...best.target }),
      shape: Object.freeze({ stringRelation, fretShift: best.fretShift, sameFret: best.fretShift === 0 }),
      policyVersion: ROOT_MOTION_FINGERING_POLICY_VERSION,
      tieBreakReason: "fret-shift-then-midrange-then-edge-avoidance-then-lexical",
    }),
  });
}

export function generateRootMotionExercise(input: RootMotionGeneratorSnapshot): RootMotionGeneratorResult {
  const normalized = normalizeRootMotionSnapshot(input);
  if (!normalized.ok) return normalized;
  const snapshot = normalized.snapshot;
  const startingNotes = playableMidiRange(snapshot);
  if (startingNotes.length === 0) return invalidConfig("The configured bass range has no playable notes.");

  for (let attempt = 0; attempt < ROOT_MOTION_MAX_ATTEMPTS; attempt += 1) {
    const random = createSeededRandom(`${snapshot.seed}\u0000root-motion\u0000${attempt}`);
    const motions = Object.freeze(Array.from({ length: snapshot.noteCount - 1 }, () => pickMotion(random.integer)));
    const eligibleStarts = startingNotes.filter((start) => isLegalPath(start, motions, snapshot));
    if (eligibleStarts.length === 0) continue;
    const start = eligibleStarts[random.integer(0, eligibleStarts.length - 1)];
    const notes = [start];
    for (const motion of motions) notes.push(notes[notes.length - 1] + motion.signedSemitones);
    const fingering = notes.slice(1).map((target, index) => solveRootMotionFingering({
      sourceMidi: notes[index], targetMidi: target, tuning: snapshot.tuning, fretRange: snapshot.fretRange,
    }));
    if (fingering.some((result) => !result.ok)) continue;
    const durationBeats = snapshot.phraseLengthBeats / snapshot.noteCount;
    const targetEvents = Object.freeze(notes.map((midiNote, index) => Object.freeze({
      index, midiNote, startBeat: index * durationBeats, durationBeats, velocity: 0.82,
    })));
    const exercise = deepFreeze<RootMotionExercise>({
      id: `root-motion-${stableHash({ generatorVersion: snapshot.generatorVersion, snapshot, attempt, notes, motions })}`,
      version: 1,
      generatorVersion: snapshot.generatorVersion,
      seed: snapshot.seed,
      mode: "root-motion",
      source: { kind: "generated" },
      level: snapshot.level,
      tempo: snapshot.tempo,
      meter: { numerator: 4, denominator: 4 },
      targetEvents,
      motions,
      fingering: fingering.map((result) => (result as Extract<RootMotionFingeringResult, { readonly ok: true }>).pair),
      generatorSnapshot: snapshot,
    });
    return Object.freeze({ ok: true, exercise });
  }
  return Object.freeze({ ok: false, error: Object.freeze({
    code: "attempts-exhausted",
    message: `Unable to generate a playable Root Motion exercise in ${ROOT_MOTION_MAX_ATTEMPTS} attempts.`,
    attempts: ROOT_MOTION_MAX_ATTEMPTS,
  }) });
}

export function normalizeRootMotionSnapshot(input: RootMotionGeneratorSnapshot):
  | { readonly ok: true; readonly snapshot: RootMotionGeneratorSnapshot }
  | { readonly ok: false; readonly error: Extract<RootMotionGeneratorResult, { readonly ok: false }>["error"] } {
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 5) return invalidConfig("Level must be an integer between 1 and 5.");
  if (!Number.isInteger(input.noteCount) || input.noteCount < 2 || input.noteCount > 4) return invalidConfig("Note count must be between 2 and 4.");
  if ((input.level <= 3 && input.noteCount !== 2) || (input.level >= 4 && input.noteCount < 3)) return invalidConfig("The selected level and note count are incompatible.");
  if (![2, 4, 6, 8].includes(input.phraseLengthBeats)) return invalidConfig("Phrase length must be 2, 4, 6, or 8 beats.");
  if (!Number.isInteger(input.tempo) || input.tempo < 30 || input.tempo > 240) return invalidConfig("Tempo must be an integer between 30 and 240 BPM.");
  if (input.tuning.length !== input.stringCount || (input.stringCount !== 4 && input.stringCount !== 5)) return invalidConfig("Tuning must match a four- or five-string bass.");
  if (input.tuning.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) return invalidConfig("Tuning notes must be MIDI integers.");
  if (!isFretRange(input.fretRange) || !isPitchSpan(input.pitchSpan)) return invalidConfig("Fret range or pitch span is invalid.");
  if (input.handedness !== "left" && input.handedness !== "right") return invalidConfig("Handedness must be left or right.");
  if (input.generatorVersion.trim().length === 0 || input.generatorVersion.length > 64) return invalidConfig("Generator version must contain 1 to 64 characters.");
  if (input.seed.length === 0 || input.seed.length > 256) return invalidConfig("Seed must contain 1 to 256 characters.");
  if (input.maxAttempts !== ROOT_MOTION_MAX_ATTEMPTS) return invalidConfig(`Root Motion max attempts is fixed at ${ROOT_MOTION_MAX_ATTEMPTS}.`);
  return Object.freeze({ ok: true, snapshot: deepFreeze({
    generatorVersion: input.generatorVersion.trim(), seed: input.seed, level: input.level,
    noteCount: input.noteCount, phraseLengthBeats: input.phraseLengthBeats, tempo: input.tempo,
    tuning: [...input.tuning], stringCount: input.stringCount, fretRange: { ...input.fretRange },
    pitchSpan: { ...input.pitchSpan }, handedness: input.handedness, maxAttempts: ROOT_MOTION_MAX_ATTEMPTS as typeof ROOT_MOTION_MAX_ATTEMPTS,
  }) });
}

function pickMotion(integer: (minimum: number, maximumInclusive: number) => number): RootMotion {
  const total = MOTION_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let offset = integer(1, total);
  for (const [signed, weight] of MOTION_WEIGHTS) {
    offset -= weight;
    if (offset <= 0) return rootMotionFromSignedSemitones(signed);
  }
  return rootMotionFromSignedSemitones(0);
}

function playableMidiRange(snapshot: RootMotionGeneratorSnapshot): readonly number[] {
  const notes: number[] = [];
  for (let midi = snapshot.pitchSpan.minMidi; midi <= snapshot.pitchSpan.maxMidi; midi += 1) {
    if (fretboardPositions(midi, snapshot.tuning, snapshot.fretRange).length > 0) notes.push(midi);
  }
  return notes;
}

function isLegalPath(start: number, motions: readonly RootMotion[], snapshot: RootMotionGeneratorSnapshot): boolean {
  let current = start;
  for (const motion of motions) {
    const next = current + motion.signedSemitones;
    if (next < snapshot.pitchSpan.minMidi || next > snapshot.pitchSpan.maxMidi) return false;
    if (!solveRootMotionFingering({ sourceMidi: current, targetMidi: next, tuning: snapshot.tuning, fretRange: snapshot.fretRange }).ok) return false;
    current = next;
  }
  return true;
}

function isFretRange(value: { readonly min: number; readonly max: number }): boolean {
  return Number.isInteger(value.min) && Number.isInteger(value.max) && value.min >= 0 && value.max <= 36 && value.min <= value.max;
}

function isPitchSpan(value: { readonly minMidi: number; readonly maxMidi: number }): boolean {
  return Number.isInteger(value.minMidi) && Number.isInteger(value.maxMidi) && value.minMidi >= 0 && value.maxMidi <= 127 && value.minMidi <= value.maxMidi;
}

function invalidConfig(message: string): Extract<RootMotionGeneratorResult, { readonly ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code: "invalid-config", message, attempts: 0 }) });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function deriveRootMotionTransfer(source: RootMotionExercise): RootMotionGeneratorResult {
  const snapshot = source.generatorSnapshot;
  const random = createSeededRandom(`root-motion-transfer\u0000${source.id}`);
  const candidates = playableMidiRange(snapshot).filter((start) => start !== source.targetEvents[0]?.midiNote && isLegalPath(start, source.motions, snapshot));
  if (!candidates.length) return Object.freeze({ ok: false, error: Object.freeze({ code: "attempts-exhausted", message: "No legal alternate starting root is available for this Transfer.", attempts: ROOT_MOTION_MAX_ATTEMPTS }) });
  const notes = [candidates[random.integer(0, candidates.length - 1)]];
  for (const motion of source.motions) notes.push(notes[notes.length - 1] + motion.signedSemitones);
  const pairs = notes.slice(1).map((target, index) => solveRootMotionFingering({ sourceMidi: notes[index], targetMidi: target, tuning: snapshot.tuning, fretRange: snapshot.fretRange }));
  if (pairs.some((entry) => !entry.ok)) return Object.freeze({ ok: false, error: Object.freeze({ code: "attempts-exhausted", message: "No legal fingering is available for this Transfer.", attempts: ROOT_MOTION_MAX_ATTEMPTS }) });
  const durationBeats = snapshot.phraseLengthBeats / snapshot.noteCount;
  const exercise = deepFreeze<RootMotionExercise>({
    id: `root-motion-transfer-${stableHash({ source: source.id, notes })}`,
    version: 1, generatorVersion: snapshot.generatorVersion, seed: `transfer-v1:${source.id}`, mode: "root-motion", source: { kind: "generated" }, level: source.level, tempo: snapshot.tempo, meter: { numerator: 4, denominator: 4 },
    targetEvents: notes.map((midiNote, index) => ({ index, midiNote, startBeat: index * durationBeats, durationBeats, velocity: 0.82 })),
    motions: source.motions, fingering: pairs.map((entry) => (entry as Extract<RootMotionFingeringResult, { readonly ok: true }>).pair),
    generatorSnapshot: deepFreeze({ ...snapshot, seed: `transfer-v1:${source.id}` }),
  });
  return Object.freeze({ ok: true, exercise });
}