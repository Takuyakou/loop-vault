import { stableHash } from "./determinism";
import { validateChordContextSnapshot, type VaultChordContextSnapshot } from "./chordContextSnapshot";
import {  ROOT_MOTION_MAX_ATTEMPTS,
  rootMotionFromSignedSemitones,
  rootMotionPhraseLengthBeats,
  solveRootMotionFingering,
  type RootMotion,
  type RootMotionExercise,
  type RootMotionFingeringPair,
  type RootMotionLevel,
  type RootMotionNoteCount,
} from "./rootMotion";
import type { Handedness, StringCount } from "./types";

export const ROOT_MOTION_VAULT_ROOT_PATH_VERSION = "p5.19-vault-root-path-v2" as const;
export const ROOT_MOTION_ROOT_PATH_POLICY_VERSION = "v1" as const;

export type VaultRootMotionResult =
  | { readonly ok: true; readonly exercise: RootMotionExercise }
  | { readonly ok: false; readonly error: { readonly code: "source-unavailable" | "unsupported-source" | "unplayable-root-path"; readonly message: string } };

export interface VaultRootMotionInput {
  readonly snapshot: VaultChordContextSnapshot;
  readonly level: RootMotionLevel;
  /** Explicit user-selected chain length. Root paths never silently shorten it. */
  readonly noteCount: RootMotionNoteCount;
  readonly tuning: readonly number[];
  readonly stringCount: StringCount;
  readonly fretRange: { readonly min: number; readonly max: number };
  readonly pitchSpan: { readonly minMidi: number; readonly maxMidi: number };
  readonly handedness: Handedness;
}

/**
 * Creates a deterministic playable pitch path from safe chord-root pitch classes.
 * A Vault root path is never presented as an original bassline: source timing,
 * octave direction, and performance articulation are intentionally not imported.
 */
export function createVaultRootMotionExercise(input: VaultRootMotionInput): VaultRootMotionResult {
  const validation = validateChordContextSnapshot(input.snapshot);
  if (!validation.ok) return unavailable("unsupported-source", "Vault-derived Root Motion needs a valid saved Chord Context snapshot.");
  const snapshot = validation.snapshot;
  if (snapshot.source.kind !== "vault") return unavailable("unsupported-source", "Vault-derived Root Motion needs a saved Vault Chord Context snapshot.");
  const noteCount = input.noteCount;
  if (snapshot.section.chords.length < noteCount) {
    return unavailable("source-unavailable", "This Vault-derived root path does not have enough chord roots for the selected note count.");
  }
  if (input.tuning.length !== input.stringCount || !isValidConfig(input)) {
    return unavailable("unsupported-source", "Root Motion configuration is not playable for this Vault-derived path.");
  }
  const roots = snapshot.section.chords.slice(0, noteCount).map((chord) => chord.root);
  if (roots.some((root) => !Number.isInteger(root) || root < 0 || root > 11)) {
    return unavailable("unsupported-source", "Vault-derived root pitch classes are invalid.");
  }
  const motions = Object.freeze(roots.slice(1).map((root, index) => rootMotionFromSignedSemitones(rootPathSignedDelta(roots[index], root))));
  const candidates = [...buildCandidatePaths(roots[0], motions, input)];
  if (!candidates.length) {
    return unavailable("unplayable-root-path", "No legal bass fingering can realize this Vault-derived root path in the selected range.");
  }
  candidates.sort(compareCandidate);
  const selected = candidates[0];
  const phraseLengthBeats = rootMotionPhraseLengthBeats(noteCount);
  const durationBeats = phraseLengthBeats / noteCount;
  const source = snapshot.source;
  if (source.kind !== "vault") return unavailable("unsupported-source", "Vault-derived Root Motion needs a saved Vault Chord Context snapshot.");
  const referenceId = `${source.reference.ideaId}:${source.reference.blockId}:${snapshot.section.id}`;
  const generatorSnapshot = deepFreeze({
    generatorVersion: ROOT_MOTION_VAULT_ROOT_PATH_VERSION,
    seed: `vault-root-path:${snapshot.signature}:level:${input.level}:notes:${noteCount}:strings:${input.stringCount}:frets:${input.fretRange.min}-${input.fretRange.max}`,
    level: input.level,
    noteCount,
    phraseLengthBeats,
    tempo: Math.round(snapshot.originalBpm),
    tuning: [...input.tuning],
    stringCount: input.stringCount,
    fretRange: { ...input.fretRange },
    pitchSpan: { ...input.pitchSpan },
    handedness: input.handedness,
    maxAttempts: ROOT_MOTION_MAX_ATTEMPTS as typeof ROOT_MOTION_MAX_ATTEMPTS,
  });
  const exercise = deepFreeze<RootMotionExercise>({
    id: `root-motion-vault-${stableHash({ version: ROOT_MOTION_VAULT_ROOT_PATH_VERSION, signature: snapshot.signature, roots, notes: selected.notes, level: input.level, config: generatorSnapshot })}`,
    version: 1,
    generatorVersion: ROOT_MOTION_VAULT_ROOT_PATH_VERSION,
    seed: generatorSnapshot.seed,
    mode: "root-motion",
    source: { kind: "vault-root-path", referenceId, snapshotSignature: snapshot.signature, rootPathPolicyVersion: ROOT_MOTION_ROOT_PATH_POLICY_VERSION },
    level: input.level,
    tempo: generatorSnapshot.tempo,
    meter: { numerator: 4, denominator: 4 },
    targetEvents: selected.notes.map((midiNote, index) => ({ index, midiNote, startBeat: index * durationBeats, durationBeats, velocity: 0.82 })),
    motions,
    fingering: selected.pairs,
    generatorSnapshot,
  });
  return Object.freeze({ ok: true, exercise });
}

/** Policy v1: resolve an ambiguous pitch-class transition as 0..+6 or -5..-1. */
export function rootPathSignedDelta(currentPitchClass: number, nextPitchClass: number): -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = (nextPitchClass - currentPitchClass + 12) % 12;
  return (d <= 6 ? d : d - 12) as -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

interface CandidatePath {
  readonly notes: readonly number[];
  readonly pairs: readonly RootMotionFingeringPair[];
  readonly absoluteFretShift: number;
  readonly midpointDistance: number;
  readonly edgeCount: number;
}

function buildCandidatePaths(firstRoot: number, motions: readonly RootMotion[], input: VaultRootMotionInput): readonly CandidatePath[] {
  const candidates: CandidatePath[] = [];
  const midpoint = (input.fretRange.min + input.fretRange.max) / 2;
  for (let start = input.pitchSpan.minMidi; start <= input.pitchSpan.maxMidi; start += 1) {
    if (((start % 12) + 12) % 12 !== firstRoot) continue;
    const notes = [start];
    for (const motion of motions) notes.push(notes[notes.length - 1] + motion.signedSemitones);
    if (notes.some((note) => note < input.pitchSpan.minMidi || note > input.pitchSpan.maxMidi)) continue;
    const pairs = notes.slice(1).map((target, index) => solveRootMotionFingering({ sourceMidi: notes[index], targetMidi: target, tuning: input.tuning, fretRange: input.fretRange }));
    if (pairs.some((result) => !result.ok)) continue;
    const legalPairs = pairs.map((result) => (result as Extract<typeof result, { readonly ok: true }>).pair);
    candidates.push(Object.freeze({
      notes: Object.freeze(notes),
      pairs: Object.freeze(legalPairs),
      absoluteFretShift: legalPairs.reduce((sum, pair) => sum + Math.abs(pair.shape.fretShift), 0),
      midpointDistance: legalPairs.reduce((sum, pair) => sum + Math.abs(pair.source.fret - midpoint) + Math.abs(pair.target.fret - midpoint), 0),
      edgeCount: legalPairs.reduce((sum, pair) => sum + Number(pair.source.stringIndex === 0 || pair.source.stringIndex === input.tuning.length - 1) + Number(pair.target.stringIndex === 0 || pair.target.stringIndex === input.tuning.length - 1), 0),
    }));
  }
  return candidates;
}

function compareCandidate(left: CandidatePath, right: CandidatePath): number {
  return left.absoluteFretShift - right.absoluteFretShift
    || left.midpointDistance - right.midpointDistance
    || left.edgeCount - right.edgeCount
    || left.pairs[0]!.source.stringIndex - right.pairs[0]!.source.stringIndex
    || left.pairs[0]!.source.fret - right.pairs[0]!.source.fret
    || left.notes[0]! - right.notes[0]!;
}

function isValidConfig(input: VaultRootMotionInput): boolean {
  return Number.isInteger(input.level) && input.level >= 1 && input.level <= 5
    && Number.isInteger(input.noteCount) && input.noteCount >= 2 && input.noteCount <= 8
    && Number.isInteger(input.fretRange.min) && Number.isInteger(input.fretRange.max)
    && input.fretRange.min >= 0 && input.fretRange.max <= 36 && input.fretRange.min <= input.fretRange.max
    && Number.isInteger(input.pitchSpan.minMidi) && Number.isInteger(input.pitchSpan.maxMidi)
    && input.pitchSpan.minMidi >= 0 && input.pitchSpan.maxMidi <= 127 && input.pitchSpan.minMidi <= input.pitchSpan.maxMidi;
}

function unavailable(code: Extract<VaultRootMotionResult, { readonly ok: false }>['error']['code'], message: string): Extract<VaultRootMotionResult, { readonly ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}