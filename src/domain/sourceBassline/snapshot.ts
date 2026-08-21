import { z } from "zod";
import { chordPitchClasses } from "../chordVoicing";
import { sha256Hex } from "../midi/fingerprint";
import {
  addExactBeat,
  compareExactBeat,
  exactBeat,
  exactBeatFromTicks,
  isCanonicalExactBeat,
} from "./exactBeat";
import type {
  CapturedHarmonySpan,
  CapturedHarmonyV1,
  ExactCapturedHarmonyInput,
  ExactSourceBasslineNote,
  ExactSourceBasslineRange,
  SourceBasslineNote,
  SourceBasslineSnapshotV1,
} from "./types";

export const MAX_SOURCE_BASSLINE_NOTES = 8_192;
export const MAX_SOURCE_BASSLINE_BYTES = 1_048_576;
export const SOURCE_BASSLINE_MAX_BARS = 12;
export const SOURCE_BASSLINE_BEATS_PER_BAR = 4;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const exactBeatSchema = z.object({
  numerator: z.number().int().safe(),
  denominator: z.number().int().safe().positive(),
}).strict().refine(isCanonicalExactBeat, "Exact beat must be a reduced canonical fraction.");

const noteSchema = z.object({
  pitch: z.number().int().min(0).max(127),
  start: exactBeatSchema,
  duration: exactBeatSchema,
  velocity: z.number().finite().min(0).max(1),
  continuesFromBefore: z.boolean(),
  continuesAfterEnd: z.boolean(),
}).strict();

const harmonySpanSchema = z.object({
  start: exactBeatSchema,
  duration: exactBeatSchema,
  rootPitchClass: z.number().int().min(0).max(11),
  bassPitchClass: z.number().int().min(0).max(11).nullable(),
  allowedPitchClasses: z.array(z.number().int().min(0).max(11)).min(1).max(12)
    .refine(isStrictlyAscending, "Allowed pitch classes must be sorted and unique."),
}).strict();

const capturedHarmonySchema = z.object({
  schemaVersion: z.literal(1),
  signature: sha256Schema,
  spans: z.array(harmonySpanSchema),
}).strict();

export const sourceBasslineSnapshotSchema: z.ZodType<SourceBasslineSnapshotV1> = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.literal("selected-bass-voice"),
  snapshotSignature: sha256Schema,
  capturedMeter: z.object({ numerator: z.literal(4), denominator: z.literal(4) }).strict(),
  length: exactBeatSchema,
  capturedHarmony: capturedHarmonySchema.optional(),
  notes: z.array(noteSchema).min(1).max(MAX_SOURCE_BASSLINE_NOTES),
}).strict().superRefine((snapshot, context) => {
  try {
  if (snapshot.length.denominator !== 1
    || snapshot.length.numerator < SOURCE_BASSLINE_BEATS_PER_BAR
    || snapshot.length.numerator > SOURCE_BASSLINE_BEATS_PER_BAR * SOURCE_BASSLINE_MAX_BARS
    || snapshot.length.numerator % SOURCE_BASSLINE_BEATS_PER_BAR !== 0) {
    issue(context, ["length"], "Snapshot length must be 1..12 complete 4/4 bars.");
  }
  snapshot.notes.forEach((note, index) => {
    if (compareExactBeat(note.start, exactBeat(0, 1)) < 0
      || compareExactBeat(note.start, snapshot.length) >= 0
      || compareExactBeat(note.duration, exactBeat(0, 1)) <= 0
      || compareExactBeat(addExactBeat(note.start, note.duration), snapshot.length) > 0) {
      issue(context, ["notes", index], "Snapshot note is outside the captured range.");
    }
    if (index > 0 && compareNotes(snapshot.notes[index - 1]!, note) > 0) {
      issue(context, ["notes", index], "Snapshot notes must use canonical order.");
    }
  });
  const harmony = snapshot.capturedHarmony;
  harmony?.spans.forEach((span, index) => {
    if (compareExactBeat(span.start, exactBeat(0, 1)) < 0
      || compareExactBeat(span.duration, exactBeat(0, 1)) <= 0
      || compareExactBeat(addExactBeat(span.start, span.duration), snapshot.length) > 0) {
      issue(context, ["capturedHarmony", "spans", index], "Harmony span is outside the captured range.");
    }
    if (index > 0) {
      const previous = harmony.spans[index - 1]!;
      if (compareHarmonySpans(previous, span) > 0) {
        issue(context, ["capturedHarmony", "spans", index], "Harmony spans must use canonical order.");
      }
      if (compareExactBeat(addExactBeat(previous.start, previous.duration), span.start) > 0) {
        issue(context, ["capturedHarmony", "spans", index], "Harmony spans must not overlap.");
      }
    }
  });
  if (harmony && harmony.signature !== capturedHarmonySignature(harmony.spans)) {
    issue(context, ["capturedHarmony", "signature"], "Captured harmony signature is invalid.");
  }
  if (snapshot.snapshotSignature !== sourceBasslineSignature(snapshot)) {
    issue(context, ["snapshotSignature"], "Source bassline signature is invalid.");
  }
  if (utf8Length(canonicalSourceBasslineJson(snapshot)) > MAX_SOURCE_BASSLINE_BYTES) {
    issue(context, [], "Source bassline snapshot exceeds its byte budget.");
  }
  } catch {
    issue(context, [], "Source bassline snapshot contains unsafe exact timing.");
  }
});

export interface ExtractSourceBasslineOptions {
  readonly selectedSourceId: string;
  readonly selectedVoiceId: string;
  readonly notes: readonly ExactSourceBasslineNote[];
  readonly range: ExactSourceBasslineRange;
  readonly capturedHarmony?: ExactCapturedHarmonyInput;
}

export function extractSourceBasslineSnapshot(
  options: ExtractSourceBasslineOptions,
): SourceBasslineSnapshotV1 {
  validateRange(options.range, options.selectedSourceId);
  const ticksPerQuarter = options.range.ticksPerQuarter;
  const clippedNotes: Array<SourceBasslineNote & { sourceEventIndex: number }> = [];
  for (let index = 0; index < options.notes.length; index += 1) {
    const note = options.notes[index]!;
    if (note.sourceId !== options.selectedSourceId || note.voiceId !== options.selectedVoiceId) continue;
    validateRawNote(note, ticksPerQuarter);
    const noteEnd = checkedTickAdd(note.startTick, note.durationTick);
    if (noteEnd <= options.range.startTick || note.startTick >= options.range.endTick) continue;
    const clippedStart = Math.max(note.startTick, options.range.startTick);
    const clippedEnd = Math.min(noteEnd, options.range.endTick);
    clippedNotes.push({
      pitch: note.pitch,
      start: exactBeatFromTicks(clippedStart - options.range.startTick, ticksPerQuarter),
      duration: exactBeatFromTicks(clippedEnd - clippedStart, ticksPerQuarter),
      velocity: note.velocity,
      continuesFromBefore: note.startTick < options.range.startTick,
      continuesAfterEnd: noteEnd > options.range.endTick,
      sourceEventIndex: note.sourceEventIndex ?? index,
    });
    if (clippedNotes.length > MAX_SOURCE_BASSLINE_NOTES) {
      throw new Error("Source bassline snapshot exceeds its note budget.");
    }
  }
  const notes = clippedNotes
    .sort((left, right) => compareNotes(left, right) || left.sourceEventIndex - right.sourceEventIndex)
    .map(({ sourceEventIndex: _sourceEventIndex, ...note }) => note);
  const capturedHarmony = options.capturedHarmony
    ? buildCapturedHarmony(options.capturedHarmony, options.range)
    : undefined;
  const unsigned = {
    schemaVersion: 1 as const,
    sourceKind: "selected-bass-voice" as const,
    capturedMeter: { numerator: 4 as const, denominator: 4 as const },
    length: exactBeatFromTicks(options.range.endTick - options.range.startTick, ticksPerQuarter),
    ...(capturedHarmony ? { capturedHarmony } : {}),
    notes,
  };
  const candidate: SourceBasslineSnapshotV1 = {
    ...unsigned,
    snapshotSignature: sourceBasslineSignature(unsigned),
  };
  return sourceBasslineSnapshotSchema.parse(candidate);
}

function buildCapturedHarmony(
  input: ExactCapturedHarmonyInput,
  range: ExactSourceBasslineRange,
): CapturedHarmonyV1 {
  validateRange(range, range.sourceId);
  if (input.authority !== "raw-integer-ticks"
    || input.sourceId !== range.sourceId
    || input.rangeStartTick !== range.startTick
    || input.rangeEndTick !== range.endTick
    || input.ticksPerQuarter !== range.ticksPerQuarter) {
    throw new Error("Captured harmony does not match the authoritative MIDI source range.");
  }
  const canonical = input.spans.flatMap((span): CapturedHarmonySpan[] => {
    if (span.sourceId !== range.sourceId || span.ticksPerQuarter !== range.ticksPerQuarter) {
      throw new Error("Captured harmony does not match the authoritative MIDI source.");
    }
    assertTick(span.startTick, "Harmony start");
    assertPositiveTick(span.durationTick, "Harmony duration");
    const endTick = checkedTickAdd(span.startTick, span.durationTick);
    if (endTick <= range.startTick || span.startTick >= range.endTick) return [];
    const startTick = Math.max(span.startTick, range.startTick);
    const clippedEnd = Math.min(endTick, range.endTick);
    const allowedPitchClasses = [...new Set([
      ...chordPitchClasses(span.chord),
      ...(span.chord.bass === undefined ? [] : [span.chord.bass]),
    ].map(normalizePitchClass))].sort((left, right) => left - right);
    return [{
      start: exactBeatFromTicks(startTick - range.startTick, range.ticksPerQuarter),
      duration: exactBeatFromTicks(clippedEnd - startTick, range.ticksPerQuarter),
      rootPitchClass: normalizePitchClass(span.chord.root),
      bassPitchClass: span.chord.bass === undefined ? null : normalizePitchClass(span.chord.bass),
      allowedPitchClasses,
    }];
  }).sort(compareHarmonySpans);
  const deduplicated = canonical.filter((span, index) => index === 0
    || canonicalHarmonySpanJson(span) !== canonicalHarmonySpanJson(canonical[index - 1]!));
  for (let index = 1; index < deduplicated.length; index += 1) {
    if (compareExactBeat(
      addExactBeat(deduplicated[index - 1]!.start, deduplicated[index - 1]!.duration),
      deduplicated[index]!.start,
    ) > 0) throw new Error("Captured harmony contains conflicting overlaps.");
  }
  return {
    schemaVersion: 1,
    signature: capturedHarmonySignature(deduplicated),
    spans: deduplicated,
  };
}

export function canonicalSourceBasslineJson(snapshot: SourceBasslineSnapshotV1): string {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    sourceKind: snapshot.sourceKind,
    snapshotSignature: snapshot.snapshotSignature,
    capturedMeter: { numerator: snapshot.capturedMeter.numerator, denominator: snapshot.capturedMeter.denominator },
    length: canonicalBeat(snapshot.length),
    capturedHarmony: snapshot.capturedHarmony ? {
      schemaVersion: snapshot.capturedHarmony.schemaVersion,
      signature: snapshot.capturedHarmony.signature,
      spans: snapshot.capturedHarmony.spans.map(canonicalHarmonySpan),
    } : null,
    notes: snapshot.notes.map(canonicalNote),
  });
}

export function sourceBasslineSignature(
  snapshot: Omit<SourceBasslineSnapshotV1, "snapshotSignature"> | SourceBasslineSnapshotV1,
): string {
  return digest(JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    sourceKind: snapshot.sourceKind,
    capturedMeter: { numerator: snapshot.capturedMeter.numerator, denominator: snapshot.capturedMeter.denominator },
    length: canonicalBeat(snapshot.length),
    notes: snapshot.notes.map(canonicalNote),
    capturedHarmony: snapshot.capturedHarmony ? {
      schemaVersion: snapshot.capturedHarmony.schemaVersion,
      spans: snapshot.capturedHarmony.spans.map(canonicalHarmonySpan),
    } : null,
  }));
}

export function capturedHarmonySignature(spans: readonly CapturedHarmonySpan[]): string {
  return digest(JSON.stringify({ schemaVersion: 1, spans: spans.map(canonicalHarmonySpan) }));
}

function validateRange(range: ExactSourceBasslineRange, selectedSourceId: string): void {
  if (range.authority !== "raw-integer-ticks" || !range.constantMeterProven || !range.barAlignmentProven) {
    throw new Error("Source bassline range lacks proven raw-tick authority.");
  }
  if (range.sourceId !== selectedSourceId) throw new Error("Selected Voice and range must belong to the same MIDI source.");
  assertPositiveTick(range.ticksPerQuarter, "PPQ");
  assertTick(range.startTick, "Range start");
  assertPositiveTick(range.endTick, "Range end");
  assertPositiveTick(range.sourceEndTick, "Source end");
  if (range.endTick <= range.startTick || range.endTick > range.sourceEndTick) throw new Error("Source bassline range is invalid.");
  if (range.meter.numerator !== 4 || range.meter.denominator !== 4) throw new Error("Source bassline range must use constant 4/4.");
  const barTicks = checkedTickMultiply(range.ticksPerQuarter, SOURCE_BASSLINE_BEATS_PER_BAR);
  const lengthTicks = range.endTick - range.startTick;
  if (range.startTick % barTicks !== 0 || lengthTicks % barTicks !== 0) throw new Error("Source bassline range must be bar aligned.");
  const bars = lengthTicks / barTicks;
  if (!Number.isInteger(bars) || bars < 1 || bars > SOURCE_BASSLINE_MAX_BARS) throw new Error("Source bassline range must be 1..12 complete bars.");
}

function validateRawNote(note: ExactSourceBasslineNote, ticksPerQuarter: number): void {
  if (note.ticksPerQuarter !== ticksPerQuarter) throw new Error("Source bassline note PPQ does not match its range.");
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) throw new Error("Source bassline pitch is invalid.");
  if (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) throw new Error("Source bassline velocity is invalid.");
  assertTick(note.startTick, "Note start");
  assertPositiveTick(note.durationTick, "Note duration");
}

function compareNotes(left: SourceBasslineNote, right: SourceBasslineNote): number {
  return compareExactBeat(left.start, right.start)
    || left.pitch - right.pitch
    || compareExactBeat(left.duration, right.duration)
    || left.velocity - right.velocity
    || Number(left.continuesFromBefore) - Number(right.continuesFromBefore)
    || Number(left.continuesAfterEnd) - Number(right.continuesAfterEnd);
}

function compareHarmonySpans(left: CapturedHarmonySpan, right: CapturedHarmonySpan): number {
  return compareExactBeat(left.start, right.start)
    || compareExactBeat(left.duration, right.duration)
    || left.rootPitchClass - right.rootPitchClass
    || (left.bassPitchClass ?? -1) - (right.bassPitchClass ?? -1)
    || compareNumberArrays(left.allowedPitchClasses, right.allowedPitchClasses);
}

function canonicalNote(note: SourceBasslineNote): object {
  return {
    pitch: note.pitch,
    start: canonicalBeat(note.start),
    duration: canonicalBeat(note.duration),
    velocity: note.velocity,
    continuesFromBefore: note.continuesFromBefore,
    continuesAfterEnd: note.continuesAfterEnd,
  };
}

function canonicalHarmonySpan(span: CapturedHarmonySpan): object {
  return {
    start: canonicalBeat(span.start),
    duration: canonicalBeat(span.duration),
    rootPitchClass: span.rootPitchClass,
    bassPitchClass: span.bassPitchClass,
    allowedPitchClasses: [...span.allowedPitchClasses],
  };
}

function canonicalHarmonySpanJson(span: CapturedHarmonySpan): string {
  return JSON.stringify(canonicalHarmonySpan(span));
}

function canonicalBeat(beat: { numerator: number; denominator: number }): object {
  return { numerator: beat.numerator, denominator: beat.denominator };
}

function digest(value: string): string {
  return sha256Hex(new TextEncoder().encode(value));
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

function compareNumberArrays(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

function isStrictlyAscending(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function checkedTickAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Source tick range exceeds the supported integer range.");
  return result;
}

function checkedTickMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error("Source tick range exceeds the supported integer range.");
  return result;
}

function assertTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer tick.`);
}

function assertPositiveTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer tick.`);
}

function issue(context: z.RefinementCtx, path: Array<string | number>, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}
