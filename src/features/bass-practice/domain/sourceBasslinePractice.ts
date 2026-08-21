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

export interface SourceBasslineHarmonyEvent {
  readonly id: string;
  readonly pitchClasses: readonly number[];
  readonly startBeat: number;
  readonly durationBeats: number;
}

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
  readonly targetEvents: readonly BasslineTargetEvent[];
  readonly harmonyEvents?: readonly SourceBasslineHarmonyEvent[];
  readonly harmonyUnavailableReason?: "missing" | "incomplete" | "conflicting";
}

export type SourceBasslinePracticeWindowResult =
  | { readonly ok: true; readonly window: SourceBasslinePracticeWindow }
  | { readonly ok: false; readonly reason: "invalid-snapshot" | "invalid-window" };

interface CroppedNote extends SourceBasslineNote {
  readonly sourceOrder: number;
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
  const harmony = cropHarmony(snapshot.capturedHarmony?.spans, windowStart, windowEnd, windowLength);

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
  const targetEvents = selected.flatMap((note, index): BasslineTargetEvent[] => {
    let end = addExactBeat(note.start, note.duration);
    const next = selected[index + 1];
    if (next && compareExactBeat(end, next.start) > 0) {
      end = next.start;
      overlapClippedNoteCount += 1;
    }
    const duration = subtractBeat(end, note.start);
    if (compareExactBeat(duration, ZERO) <= 0) return [];
    return [Object.freeze({
      index,
      midiNote: note.pitch,
      startBeat: toBeatNumber(note.start),
      durationBeats: toBeatNumber(duration),
      velocity: note.velocity,
      chordIndex: 0,
    })];
  });
  return {
    targetEvents: Object.freeze(targetEvents),
    omittedSimultaneousNoteCount,
    overlapClippedNoteCount,
  };
}

function cropHarmony(
  spans: readonly CapturedHarmonySpan[] | undefined,
  windowStart: ExactBeat,
  windowEnd: ExactBeat,
  windowLength: ExactBeat,
): { readonly events?: readonly SourceBasslineHarmonyEvent[]; readonly reason?: "missing" | "incomplete" | "conflicting" } {
  if (!spans?.length) return { reason: "missing" };
  const cropped = spans.flatMap((span) => {
    const spanEnd = addExactBeat(span.start, span.duration);
    if (compareExactBeat(spanEnd, windowStart) <= 0 || compareExactBeat(span.start, windowEnd) >= 0) return [];
    const start = subtractBeat(maxBeat(span.start, windowStart), windowStart);
    const end = subtractBeat(minBeat(spanEnd, windowEnd), windowStart);
    return [{ span, start, end }];
  }).sort((left, right) => compareExactBeat(left.start, right.start) || compareExactBeat(left.end, right.end));
  if (!cropped.length) return { reason: "missing" };
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
      pitchClasses: Object.freeze([...span.allowedPitchClasses]),
      startBeat: toBeatNumber(start),
      durationBeats: toBeatNumber(subtractBeat(end, start)),
    }))),
  };
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

const ZERO = Object.freeze(exactBeat(0, 1));
