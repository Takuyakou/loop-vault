import { describe, expect, it } from "vitest";
import { MAX_TAKE_DURATION_MS } from "../recording/domain/persistence";
import { extractSourceBasslineSnapshot, type ExactSourceBasslineNote, type SourceBasslineSnapshotV1 } from "../../../domain/sourceBassline";
import {
  buildSourceBasslinePracticeWindow,
  DEFAULT_SOURCE_BASSLINE_WINDOW_BARS,
  isSourceBasslineActualBars,
  isSourceBasslineRecordEligible,
  nextSourceBasslineWindowStart,
  previousSourceBasslineWindowStart,
  sourceBasslineRecordDurationMs,
  type SourceBasslineWindowBars,
} from "./sourceBasslinePractice";

const SOURCE_ID = "p525-window-source";
const VOICE_ID = "p525-window-bass";
const PPQ = 4;
const TICKS_PER_BAR = PPQ * 4;

describe("P5.25 Source Bassline practice windows", () => {
  it("exports the two-bar default and accepts only 1/2/4/8 requested lengths", () => {
    expect(DEFAULT_SOURCE_BASSLINE_WINDOW_BARS).toBe(2);
    const snapshot = makeSnapshot(8);
    for (const requested of [1, 2, 4, 8] as const) {
      expect(buildSourceBasslinePracticeWindow(snapshot, requested, 1).ok).toBe(true);
    }
    expect(buildSourceBasslinePracticeWindow(snapshot, 3 as SourceBasslineWindowBars, 1))
      .toEqual({ ok: false, reason: "invalid-window" });
    expect([1, 2, 3, 4, 5, 6, 7, 8].every(isSourceBasslineActualBars)).toBe(true);
    expect([0, 9, 1.5, "2"].some(isSourceBasslineActualBars)).toBe(false);
  });

  it("represents every exact partial length 1..8 without changing requested length", () => {
    for (const actualBars of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const result = buildSourceBasslinePracticeWindow(makeSnapshot(actualBars), 8, 1);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.window).toMatchObject({
        requestedBars: 8,
        startBar: 1,
        endBar: actualBars,
        actualBars,
      });
    }
  });

  it("derives L3 then L1/L2 from the same crop for every requested size", () => {
    const snapshot = makeSnapshot(8);
    const before = JSON.stringify(snapshot);
    for (const requestedBars of [1, 2, 4, 8] as const) {
      const first = buildSourceBasslinePracticeWindow(snapshot, requestedBars, 1);
      const second = buildSourceBasslinePracticeWindow(snapshot, requestedBars, 1);
      expect(first).toEqual(second);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      const level1 = first.window.levels[1];
      const level2 = first.window.levels[2];
      const level3 = first.window.levels[3];
      expect(level1.available).toBe(true);
      expect(level2.available).toBe(true);
      expect(level3.available).toBe(true);
      if (!level1.available || !level2.available || !level3.available) continue;
      const timing = level3.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }));
      expect(timing).toEqual(Array.from({ length: requestedBars }, (_, index) => ({ startBeat: index * 4, durationBeats: 1 })));
      expect(level1.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }))).toEqual(timing);
      expect(level2.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }))).toEqual(timing);
      expect(level3.targetEvents.map(({ midiNote }) => midiNote)).toEqual(Array(requestedBars).fill(43));
      expect(level1.targetEvents.map(({ midiNote }) => midiNote)).toEqual(Array(requestedBars).fill(48));
      expect(level2.targetEvents.map(({ midiNote }) => midiNote)).toEqual(Array(requestedBars).fill(43));
    }
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("uses positive half-open overlap, clips both boundaries, rebases, and preserves selected pitch/velocity", () => {
    const snapshot = makeSnapshot(12, [
      rawNote(39, 60, 4, 0.5),
      rawNote(40, 60, 8, 0.7),
      rawNote(41, 64, 4, 0.9),
      rawNote(36, 56, 72, 0.6),
      rawNote(42, 124, 8, 0.8),
      rawNote(43, 128, 4, 1),
      rawNote(35, 16, 4, 0.4),
    ]);
    const result = buildSourceBasslinePracticeWindow(snapshot, 4, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window).toMatchObject({
      startBar: 5,
      endBar: 8,
      actualBars: 4,
      croppedSourceNoteCount: 4,
      boundaryClippedNoteCount: 3,
      omittedSimultaneousNoteCount: 2,
      overlapClippedNoteCount: 1,
    });
    const level1 = result.window.levels[1];
    const level2 = result.window.levels[2];
    const level3 = result.window.levels[3];
    expect(level1.available && level2.available && level3.available).toBe(true);
    if (!level1.available || !level2.available || !level3.available) return;
    const croppedTiming = [
      { startBeat: 0, durationBeats: 15 },
      { startBeat: 15, durationBeats: 1 },
    ];
    // The raw notes start at three different onsets (56/60/64 ticks), but crop
    // rebases all three to zero before monophonic projection. Projecting the
    // full source first would leave extra zero-relative events and fail this.
    expect(level3.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }))).toEqual(croppedTiming);
    expect(level1.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }))).toEqual(croppedTiming);
    expect(level2.targetEvents.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats }))).toEqual(croppedTiming);
    expect(level3.targetEvents).toEqual([
      expect.objectContaining({ midiNote: 36, velocity: 0.6 }),
      expect.objectContaining({ midiNote: 42, velocity: 0.8 }),
    ]);
    expect(level1.targetEvents.map(({ midiNote }) => midiNote)).toEqual([36, 36]);
    expect(level2.targetEvents.map(({ midiNote }) => midiNote)).toEqual([36, 43]);
  });

  it("navigates non-overlapping windows from 1 + k*requested and stays bounded", () => {
    const snapshot = makeSnapshot(12);
    for (const requestedBars of [1, 2, 4, 8] as const) {
      const ranges: Array<readonly [number, number]> = [];
      let startBar: number | undefined = 1;
      while (startBar !== undefined) {
        const result = buildSourceBasslinePracticeWindow(snapshot, requestedBars, startBar);
        expect(result.ok).toBe(true);
        if (!result.ok) break;
        ranges.push([result.window.startBar, result.window.endBar]);
        startBar = nextSourceBasslineWindowStart(12, requestedBars, startBar);
      }
      ranges.slice(1).forEach((range, index) => expect(range[0]).toBe(ranges[index]![1] + 1));
      expect(previousSourceBasslineWindowStart(requestedBars, 1)).toBeUndefined();
      expect(nextSourceBasslineWindowStart(12, requestedBars, ranges[ranges.length - 1]![0])).toBeUndefined();
    }
    expect(buildSourceBasslinePracticeWindow(snapshot, 4, 2)).toEqual({ ok: false, reason: "invalid-window" });
  });

  it("keeps the established 1/2-bar aligned and final-partial behavior", () => {
    const snapshot = makeSnapshot(3);
    const one = buildSourceBasslinePracticeWindow(snapshot, 1, 2);
    const two = buildSourceBasslinePracticeWindow(snapshot, 2, 3);
    expect(one.ok && one.window).toMatchObject({ requestedBars: 1, startBar: 2, endBar: 2, actualBars: 1 });
    expect(two.ok && two.window).toMatchObject({ requestedBars: 2, startBar: 3, endBar: 3, actualBars: 1 });
    expect(buildSourceBasslinePracticeWindow(snapshot, 2, 2)).toEqual({ ok: false, reason: "invalid-window" });
  });

  it("preflights the unchanged 60-second Record cap from actual bars and effective BPM", () => {
    expect(sourceBasslineRecordDurationMs(8, 32)).toBe(MAX_TAKE_DURATION_MS);
    expect(isSourceBasslineRecordEligible(8, 33)).toBe(true);
    expect(isSourceBasslineRecordEligible(8, 32)).toBe(true);
    expect(isSourceBasslineRecordEligible(8, 31)).toBe(false);
    expect(isSourceBasslineRecordEligible(3, 30)).toBe(true);
    expect(sourceBasslineRecordDurationMs(1, 0)).toBeUndefined();
    expect(sourceBasslineRecordDurationMs(1, Number.NaN)).toBeUndefined();
    expect(sourceBasslineRecordDurationMs(1, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(isSourceBasslineRecordEligible(1, 0)).toBe(false);
    expect(isSourceBasslineRecordEligible(1, Number.NaN)).toBe(false);
    expect(isSourceBasslineRecordEligible(1, Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

function makeSnapshot(
  bars: number,
  notes: readonly ExactSourceBasslineNote[] = Array.from({ length: bars }, (_, bar) => rawNote(43, bar * TICKS_PER_BAR, PPQ, 0.75)),
  withHarmony = true,
): SourceBasslineSnapshotV1 {
  const endTick = bars * TICKS_PER_BAR;
  return extractSourceBasslineSnapshot({
    selectedSourceId: SOURCE_ID,
    selectedVoiceId: VOICE_ID,
    notes,
    range: {
      authority: "raw-integer-ticks",
      constantMeterProven: true,
      barAlignmentProven: true,
      sourceId: SOURCE_ID,
      startTick: 0,
      endTick,
      sourceEndTick: endTick,
      ticksPerQuarter: PPQ,
      meter: { numerator: 4, denominator: 4 },
    },
    ...(withHarmony ? {
      capturedHarmony: {
        authority: "raw-integer-ticks" as const,
        sourceId: SOURCE_ID,
        rangeStartTick: 0,
        rangeEndTick: endTick,
        ticksPerQuarter: PPQ,
        spans: Array.from({ length: bars }, (_, bar) => ({
          sourceId: SOURCE_ID,
          startTick: bar * TICKS_PER_BAR,
          durationTick: TICKS_PER_BAR,
          ticksPerQuarter: PPQ,
          chord: { root: 0, quality: "maj7" as const, tensions: [], label: "Cmaj7" },
        })),
      },
    } : {}),
  });
}

function rawNote(pitch: number, startTick: number, durationTick: number, velocity: number): ExactSourceBasslineNote {
  return { sourceId: SOURCE_ID, voiceId: VOICE_ID, pitch, startTick, durationTick, velocity, ticksPerQuarter: PPQ };
}
