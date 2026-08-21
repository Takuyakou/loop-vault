import {
  addExactBeat,
  compareExactBeat,
  exactBeat,
  sourceBasslineSnapshotSchema,
  type CapturedHarmonySpan,
  type ExactBeat,
  type SourceBasslineNote,
  type SourceBasslineSnapshotV1,
} from "../../../domain/sourceBassline";
import type { BasslineTargetEvent } from "./types";

export type SourceBasslineWindowBars = 1 | 2;
export type SourceBasslinePracticeLevel = 1 | 2 | 3;
export type SourceBasslineSimplificationUnavailableReason =
  | "missing-harmony"
  | "harmony-gap"
  | "conflicting-harmony"
  | "unsafe-playable-range";

export interface SourceBasslineHarmonyEvent {
  readonly id: string;
  readonly rootPitchClass: number;
  readonly pitchClasses: readonly number[];
  readonly startBeat: number;
  readonly durationBeats: number;
}

export type SourceBasslinePracticeLevelResult =
  | {
    readonly available: true;
    readonly level: SourceBasslinePracticeLevel;
    readonly targetEvents: readonly BasslineTargetEvent[];
    readonly pitchReplacementCount: number;
  }
  | {
    readonly available: false;
    readonly level: 1 | 2;
    readonly reason: SourceBasslineSimplificationUnavailableReason;
  };

export interface SourceBasslinePracticeWindow {
  readonly snapshotSignature: string;
  readonly requestedBars: SourceBasslineWindowBars;
  readonly totalBars: number;
  readonly startBar: number;
  readonly endBar: number;
  readonly actualBars: number;
  readonly croppedSourceNoteCount: number;
  readonly boundaryClippedNoteCount: number;
  readonly omittedSimultaneousNoteCount: number;
  readonly overlapClippedNoteCount: number;
  /** Backward-compatible Level 3 target. The immutable source snapshot is never changed. */
  readonly targetEvents: readonly BasslineTargetEvent[];
  readonly levels: Readonly<{
    readonly 1: SourceBasslinePracticeLevelResult;
    readonly 2: SourceBasslinePracticeLevelResult;
    readonly 3: SourceBasslinePracticeLevelResult;
  }>;
  readonly harmonyEvents?: readonly SourceBasslineHarmonyEvent[];
  readonly harmonyUnavailableReason?: "missing" | "incomplete" | "conflicting";
}

export type SourceBasslinePracticeWindowResult =
  | { readonly ok: true; readonly window: SourceBasslinePracticeWindow }
  | { readonly ok: false; readonly reason: "invalid-snapshot" | "invalid-window" };

interface CroppedNote extends SourceBasslineNote {
  readonly sourceOrder: number;
}

interface ProjectedExactEvent {
  readonly start: ExactBeat;
  readonly duration: ExactBeat;
  readonly event: BasslineTargetEvent;
}

interface CroppedHarmonySpan {
  readonly span: CapturedHarmonySpan;
  readonly start: ExactBeat;
  readonly end: ExactBeat;
}

export function buildSourceBasslinePracticeWindow(
  snapshotInput: SourceBasslineSnapshotV1,
  requestedBars: SourceBasslineWindowBars,
  startBar: number,
): SourceBasslinePracticeWindowResult {
  const parsed = sourceBasslineSnapshotSchema.safeParse(snapshotInput);
  if (!parsed.success) return { ok: false, reason: "invalid-snapshot" };
  const snapshot = parsed.data;
  const totalBars = exactIntegerBars(snapshot.length);
  if (!totalBars || (requestedBars !== 1 && requestedBars !== 2)
    || !Number.isInteger(startBar) || startBar < 1 || startBar > totalBars
    || (startBar - 1) % requestedBars !== 0) {
    return { ok: false, reason: "invalid-window" };
  }

  const actualBars = Math.min(requestedBars, totalBars - startBar + 1);
  const windowStart = exactBeat((startBar - 1) * 4, 1);
  const windowLength = exactBeat(actualBars * 4, 1);
  const windowEnd = addExactBeat(windowStart, windowLength);
  const cropped = cropNotes(snapshot.notes, windowStart, windowEnd);
  const projection = projectMonophonic(cropped.notes);
  const croppedHarmony = cropHarmonySpans(snapshot.capturedHarmony?.spans, windowStart, windowEnd);
  const harmony = buildChordContextHarmony(croppedHarmony, windowLength, Boolean(snapshot.capturedHarmony?.spans.length));
  const level1 = deriveSimplifiedLevel(1, projection.exactEvents, croppedHarmony, Boolean(snapshot.capturedHarmony?.spans.length));
  const level2 = deriveSimplifiedLevel(2, projection.exactEvents, croppedHarmony, Boolean(snapshot.capturedHarmony?.spans.length));
  const level3: SourceBasslinePracticeLevelResult = Object.freeze({
    available: true,
    level: 3,
    targetEvents: projection.targetEvents,
    pitchReplacementCount: 0,
  });

  return {
    ok: true,
    window: Object.freeze({
      snapshotSignature: snapshot.snapshotSignature,
      requestedBars,
      totalBars,
      startBar,
      endBar: startBar + actualBars - 1,
      actualBars,
      croppedSourceNoteCount: cropped.notes.length,
      boundaryClippedNoteCount: cropped.boundaryClippedNoteCount,
      omittedSimultaneousNoteCount: projection.omittedSimultaneousNoteCount,
      overlapClippedNoteCount: projection.overlapClippedNoteCount,
      targetEvents: projection.targetEvents,
      levels: Object.freeze({ 1: level1, 2: level2, 3: level3 }),
      ...(harmony.events ? { harmonyEvents: harmony.events } : {}),
      ...(harmony.reason ? { harmonyUnavailableReason: harmony.reason } : {}),
    }),
  };
}

export function nextSourceBasslineWindowStart(
  totalBars: number,
  requestedBars: SourceBasslineWindowBars,
  currentStartBar: number,
): number | undefined {
  const next = currentStartBar + requestedBars;
  return next <= totalBars ? next : undefined;
}

export function previousSourceBasslineWindowStart(
  requestedBars: SourceBasslineWindowBars,
  currentStartBar: number,
): number | undefined {
  const previous = currentStartBar - requestedBars;
  return previous >= 1 ? previous : undefined;
}

function cropNotes(
  notes: readonly SourceBasslineNote[],
  windowStart: ExactBeat,
  windowEnd: ExactBeat,
): { readonly notes: readonly CroppedNote[]; readonly boundaryClippedNoteCount: number } {
  const result: CroppedNote[] = [];
  let boundaryClippedNoteCount = 0;
  notes.forEach((note, sourceOrder) => {
    const noteEnd = addExactBeat(note.start, note.duration);
    if (compareExactBeat(noteEnd, windowStart) <= 0 || compareExactBeat(note.start, windowEnd) >= 0) return;
    const clippedStart = maxBeat(note.start, windowStart);
    const clippedEnd = minBeat(noteEnd, windowEnd);
    const startsBefore = compareExactBeat(note.start, windowStart) < 0;
    const endsAfter = compareExactBeat(noteEnd, windowEnd) > 0;
    if (startsBefore || endsAfter) boundaryClippedNoteCount += 1;
    result.push(Object.freeze({
      ...note,
      start: subtractBeat(clippedStart, windowStart),
      duration: subtractBeat(clippedEnd, clippedStart),
      continuesFromBefore: startsBefore || (compareExactBeat(windowStart, ZERO) === 0 && note.continuesFromBefore),
      continuesAfterEnd: endsAfter || (compareExactBeat(windowEnd, noteEnd) === 0 && note.continuesAfterEnd),
      sourceOrder,
    }));
  });
  return { notes: Object.freeze(result), boundaryClippedNoteCount };
}

function projectMonophonic(notes: readonly CroppedNote[]): {
  readonly targetEvents: readonly BasslineTargetEvent[];
  readonly exactEvents: readonly ProjectedExactEvent[];
  readonly omittedSimultaneousNoteCount: number;
  readonly overlapClippedNoteCount: number;
} {
  const selected: CroppedNote[] = [];
  let omittedSimultaneousNoteCount = 0;
  for (let index = 0; index < notes.length;) {
    const onset = notes[index]!.start;
    const group: CroppedNote[] = [];
    while (index < notes.length && compareExactBeat(notes[index]!.start, onset) === 0) {
      group.push(notes[index]!);
      index += 1;
    }
    group.sort(compareProjectionChoice);
    selected.push(group[0]!);
    omittedSimultaneousNoteCount += group.length - 1;
  }

  let overlapClippedNoteCount = 0;
  const exactEvents = selected.flatMap((note, index): ProjectedExactEvent[] => {
    let end = addExactBeat(note.start, note.duration);
    const next = selected[index + 1];
    if (next && compareExactBeat(end, next.start) > 0) {
      end = next.start;
      overlapClippedNoteCount += 1;
    }
    const duration = subtractBeat(end, note.start);
    if (compareExactBeat(duration, ZERO) <= 0) return [];
    return [Object.freeze({
      start: note.start,
      duration,
      event: Object.freeze({
        index,
        midiNote: note.pitch,
        startBeat: toBeatNumber(note.start),
        durationBeats: toBeatNumber(duration),
        velocity: note.velocity,
        chordIndex: 0,
      }),
    })];
  });
  const targetEvents = Object.freeze(exactEvents.map(({ event }) => event));
  return {
    targetEvents,
    exactEvents: Object.freeze(exactEvents),
    omittedSimultaneousNoteCount,
    overlapClippedNoteCount,
  };
}

function cropHarmonySpans(
  spans: readonly CapturedHarmonySpan[] | undefined,
  windowStart: ExactBeat,
  windowEnd: ExactBeat,
): readonly CroppedHarmonySpan[] {
  if (!spans?.length) return Object.freeze([]);
  return Object.freeze(spans.flatMap((span): CroppedHarmonySpan[] => {
    const spanEnd = addExactBeat(span.start, span.duration);
    if (compareExactBeat(spanEnd, windowStart) <= 0 || compareExactBeat(span.start, windowEnd) >= 0) return [];
    return [Object.freeze({
      span,
      start: subtractBeat(maxBeat(span.start, windowStart), windowStart),
      end: subtractBeat(minBeat(spanEnd, windowEnd), windowStart),
    })];
  }).sort((left, right) => compareExactBeat(left.start, right.start) || compareExactBeat(left.end, right.end)));
}

function buildChordContextHarmony(
  cropped: readonly CroppedHarmonySpan[],
  windowLength: ExactBeat,
  hasCapturedHarmony: boolean,
): { readonly events?: readonly SourceBasslineHarmonyEvent[]; readonly reason?: "missing" | "incomplete" | "conflicting" } {
  if (!hasCapturedHarmony || !cropped.length) return { reason: "missing" };
  let coveredUntil = ZERO;
  for (const current of cropped) {
    if (compareExactBeat(current.start, coveredUntil) > 0) return { reason: "incomplete" };
    if (compareExactBeat(current.start, coveredUntil) < 0) return { reason: "conflicting" };
    coveredUntil = current.end;
  }
  if (compareExactBeat(coveredUntil, windowLength) !== 0) return { reason: "incomplete" };
  return {
    events: Object.freeze(cropped.map(({ span, start, end }, index) => Object.freeze({
      id: `source-harmony:${index}`,
      rootPitchClass: span.rootPitchClass,
      pitchClasses: Object.freeze([...span.allowedPitchClasses]),
      startBeat: toBeatNumber(start),
      durationBeats: toBeatNumber(subtractBeat(end, start)),
    }))),
  };
}

function deriveSimplifiedLevel(
  level: 1 | 2,
  projected: readonly ProjectedExactEvent[],
  harmony: readonly CroppedHarmonySpan[],
  hasCapturedHarmony: boolean,
): SourceBasslinePracticeLevelResult {
  if (!hasCapturedHarmony) {
    return Object.freeze({ available: false, level, reason: "missing-harmony" });
  }

  let previousEnd: ExactBeat | undefined;
  for (const current of harmony) {
    if (previousEnd && compareExactBeat(current.start, previousEnd) < 0) {
      return Object.freeze({ available: false, level, reason: "conflicting-harmony" });
    }
    previousEnd = current.end;
  }

  const targetEvents: BasslineTargetEvent[] = [];
  let pitchReplacementCount = 0;
  let harmonyIndex = 0;
  for (const projectedEvent of projected) {
    while (
      harmonyIndex < harmony.length
      && compareExactBeat(harmony[harmonyIndex]!.end, projectedEvent.start) <= 0
    ) harmonyIndex += 1;
    const active = harmony[harmonyIndex];
    if (
      !active
      || compareExactBeat(active.start, projectedEvent.start) > 0
      || compareExactBeat(projectedEvent.start, active.end) >= 0
    ) return Object.freeze({ available: false, level, reason: "harmony-gap" });

    const sourcePitch = projectedEvent.event.midiNote;
    const pitchClasses = level === 1
      ? [active.span.rootPitchClass]
      : active.span.allowedPitchClasses;
    const isLegalSource = level === 2
      && sourcePitch >= PLAYABLE_MIN_MIDI
      && sourcePitch <= PLAYABLE_MAX_MIDI
      && pitchClasses.includes(normalizePitchClass(sourcePitch));
    const mappedPitch = isLegalSource ? sourcePitch : nearestPlayablePitch(sourcePitch, pitchClasses);
    if (mappedPitch === undefined) return Object.freeze({ available: false, level, reason: "unsafe-playable-range" });
    if (mappedPitch !== sourcePitch) pitchReplacementCount += 1;
    targetEvents.push(Object.freeze({ ...projectedEvent.event, midiNote: mappedPitch }));
  }
  return Object.freeze({
    available: true,
    level,
    targetEvents: Object.freeze(targetEvents),
    pitchReplacementCount,
  });
}

function nearestPlayablePitch(sourcePitch: number, pitchClasses: readonly number[]): number | undefined {
  const allowed = new Set(pitchClasses.map(normalizePitchClass));
  let bestPitch: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let pitch = PLAYABLE_MIN_MIDI; pitch <= PLAYABLE_MAX_MIDI; pitch += 1) {
    if (!allowed.has(normalizePitchClass(pitch))) continue;
    const distance = Math.abs(pitch - sourcePitch);
    if (distance < bestDistance) {
      bestPitch = pitch;
      bestDistance = distance;
    }
  }
  return bestPitch;
}

function compareProjectionChoice(left: CroppedNote, right: CroppedNote): number {
  return left.pitch - right.pitch
    || compareExactBeat(right.duration, left.duration)
    || right.velocity - left.velocity
    || left.sourceOrder - right.sourceOrder;
}

function exactIntegerBars(length: ExactBeat): number | undefined {
  const beats = toBeatNumber(length);
  const bars = beats / 4;
  return Number.isInteger(bars) && bars >= 1 && bars <= 12 ? bars : undefined;
}

function subtractBeat(left: ExactBeat, right: ExactBeat): ExactBeat {
  return addExactBeat(left, exactBeat(-right.numerator, right.denominator));
}

function minBeat(left: ExactBeat, right: ExactBeat): ExactBeat {
  return compareExactBeat(left, right) <= 0 ? left : right;
}

function maxBeat(left: ExactBeat, right: ExactBeat): ExactBeat {
  return compareExactBeat(left, right) >= 0 ? left : right;
}

function toBeatNumber(value: ExactBeat): number {
  return value.numerator / value.denominator;
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

const ZERO = Object.freeze(exactBeat(0, 1));
const PLAYABLE_MIN_MIDI = 28;
const PLAYABLE_MAX_MIDI = 55;