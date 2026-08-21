import { describe, expect, it } from "vitest";
import { extractSourceBasslineSnapshot, type SourceBasslineSnapshotV1 } from "../../../domain/sourceBassline";
import {
  buildSourceBasslinePracticeWindow,
  nextSourceBasslineWindowStart,
  previousSourceBasslineWindowStart,
} from "./sourceBasslinePractice";

function snapshot(withHarmony = true): SourceBasslineSnapshotV1 {
  const sourceId = "synthetic-source";
  const voiceId = "synthetic-bass";
  return extractSourceBasslineSnapshot({
    selectedSourceId: sourceId,
    selectedVoiceId: voiceId,
    range: {
      authority: "raw-integer-ticks",
      constantMeterProven: true,
      barAlignmentProven: true,
      sourceId,
      startTick: 0,
      endTick: 48,
      sourceEndTick: 48,
      ticksPerQuarter: 4,
      meter: { numerator: 4, denominator: 4 },
    },
    notes: [
      { sourceId, voiceId, pitch: 48, velocity: 0.9, startTick: 0, durationTick: 8, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 43, velocity: 0.7, startTick: 0, durationTick: 4, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 45, velocity: 0.8, startTick: 2, durationTick: 4, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 40, velocity: 0.8, startTick: 15, durationTick: 2, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 41, velocity: 0.8, startTick: 16, durationTick: 2, ticksPerQuarter: 4 },
      { sourceId, voiceId, pitch: 44, velocity: 0.8, startTick: 32, durationTick: 4, ticksPerQuarter: 4 },
    ],
    ...(withHarmony ? {
      capturedHarmony: {
        authority: "raw-integer-ticks" as const,
        sourceId,
        rangeStartTick: 0,
        rangeEndTick: 48,
        ticksPerQuarter: 4,
        spans: [
          { sourceId, startTick: 0, durationTick: 16, ticksPerQuarter: 4, chord: { root: 0, quality: "maj7" as const, tensions: [], label: "Cmaj7" } },
          { sourceId, startTick: 16, durationTick: 16, ticksPerQuarter: 4, chord: { root: 5, quality: "maj7" as const, tensions: [], label: "Fmaj7" } },
          { sourceId, startTick: 32, durationTick: 16, ticksPerQuarter: 4, chord: { root: 7, quality: "dom7" as const, tensions: [], label: "G7" } },
        ],
      },
    } : {}),
  });
}

describe("Source Bassline Level 3 windows", () => {
  it("crops first, chooses the deterministic lowest onset note, and clips overlap at the next onset", () => {
    const result = buildSourceBasslinePracticeWindow(snapshot(), 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.targetEvents).toEqual([
      expect.objectContaining({ midiNote: 43, startBeat: 0, durationBeats: 0.5 }),
      expect.objectContaining({ midiNote: 45, startBeat: 0.5, durationBeats: 1 }),
      expect.objectContaining({ midiNote: 40, startBeat: 3.75, durationBeats: 0.25 }),
    ]);
    expect(result.window.omittedSimultaneousNoteCount).toBe(1);
    expect(result.window.overlapClippedNoteCount).toBe(1);
    expect(result.window.boundaryClippedNoteCount).toBe(1);
  });

  it("breaks same-pitch onset ties by longer duration and then higher velocity", () => {
    const build = (notes: readonly { readonly durationTick: number; readonly velocity: number }[]) => extractSourceBasslineSnapshot({
      selectedSourceId: "tie-source",
      selectedVoiceId: "tie-voice",
      range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId: "tie-source", startTick: 0, endTick: 16, sourceEndTick: 16, ticksPerQuarter: 4, meter: { numerator: 4, denominator: 4 } },
      notes: notes.map((note) => ({ sourceId: "tie-source", voiceId: "tie-voice", pitch: 40, startTick: 0, ticksPerQuarter: 4, ...note })),
    });
    const durationTie = buildSourceBasslinePracticeWindow(build([
      { durationTick: 4, velocity: 1 },
      { durationTick: 8, velocity: 0.4 },
    ]), 1, 1);
    const velocityTie = buildSourceBasslinePracticeWindow(build([
      { durationTick: 4, velocity: 0.2 },
      { durationTick: 4, velocity: 0.9 },
    ]), 1, 1);

    expect(durationTie.ok && durationTie.window.targetEvents).toEqual([
      expect.objectContaining({ midiNote: 40, durationBeats: 2, velocity: 0.4 }),
    ]);
    expect(velocityTie.ok && velocityTie.window.targetEvents).toEqual([
      expect.objectContaining({ midiNote: 40, durationBeats: 1, velocity: 0.9 }),
    ]);
  });
  it("keeps exact half-open boundary behavior and rebases a crossing note after crop", () => {
    const result = buildSourceBasslinePracticeWindow(snapshot(), 1, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.targetEvents).toEqual([
      expect.objectContaining({ midiNote: 40, startBeat: 0, durationBeats: 0.25 }),
    ]);
    expect(result.window.croppedSourceNoteCount).toBe(2);
    expect(result.window.omittedSimultaneousNoteCount).toBe(1);
    expect(result.window.boundaryClippedNoteCount).toBe(1);
  });

  it("keeps odd-PPQ triplets exact across a half-open bar boundary", () => {
    const source = extractSourceBasslineSnapshot({
      selectedSourceId: "odd-ppq-source",
      selectedVoiceId: "odd-ppq-bass",
      range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId: "odd-ppq-source", startTick: 0, endTick: 72, sourceEndTick: 72, ticksPerQuarter: 9, meter: { numerator: 4, denominator: 4 } },
      notes: [
        { sourceId: "odd-ppq-source", voiceId: "odd-ppq-bass", pitch: 39, velocity: 0.7, startTick: 33, durationTick: 3, ticksPerQuarter: 9 },
        { sourceId: "odd-ppq-source", voiceId: "odd-ppq-bass", pitch: 40, velocity: 0.8, startTick: 35, durationTick: 4, ticksPerQuarter: 9 },
        { sourceId: "odd-ppq-source", voiceId: "odd-ppq-bass", pitch: 41, velocity: 0.9, startTick: 36, durationTick: 6, ticksPerQuarter: 9 },
        { sourceId: "odd-ppq-source", voiceId: "odd-ppq-bass", pitch: 43, velocity: 0.6, startTick: 39, durationTick: 3, ticksPerQuarter: 9 },
      ],
    });
    const result = buildSourceBasslinePracticeWindow(source, 1, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.croppedSourceNoteCount).toBe(3);
    expect(result.window.boundaryClippedNoteCount).toBe(1);
    expect(result.window.omittedSimultaneousNoteCount).toBe(1);
    expect(result.window.targetEvents).toHaveLength(2);
    expect(result.window.targetEvents[0]).toMatchObject({ midiNote: 40, startBeat: 0 });
    expect(result.window.targetEvents[0]?.durationBeats).toBeCloseTo(1 / 3, 12);
    expect(result.window.targetEvents[1]).toMatchObject({ midiNote: 43 });
    expect(result.window.targetEvents[1]?.startBeat).toBeCloseTo(1 / 3, 12);
    expect(result.window.targetEvents[1]?.durationBeats).toBeCloseTo(1 / 3, 12);
  });
  it("labels an odd final two-bar step as its actual one-bar range", () => {
    const result = buildSourceBasslinePracticeWindow(snapshot(), 2, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window).toMatchObject({ requestedBars: 2, totalBars: 3, startBar: 3, endBar: 3, actualBars: 1 });
    expect(result.window.targetEvents).toEqual([expect.objectContaining({ midiNote: 44, startBeat: 0, durationBeats: 1 })]);
    expect(result.window.harmonyEvents).toEqual([expect.objectContaining({ startBeat: 0, durationBeats: 4 })]);
  });

  it("keeps an empty window explicit and reports missing captured harmony", () => {
    const result = buildSourceBasslinePracticeWindow(snapshot(false), 1, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.targetEvents.length).toBeGreaterThan(0);
    expect(result.window.harmonyEvents).toBeUndefined();
    expect(result.window.harmonyUnavailableReason).toBe("missing");

    const emptyInput = snapshot(false);
    const withoutMiddleNotes = extractSourceBasslineSnapshot({
      selectedSourceId: "s",
      selectedVoiceId: "v",
      range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId: "s", startTick: 0, endTick: 32, sourceEndTick: 32, ticksPerQuarter: 4, meter: { numerator: 4, denominator: 4 } },
      notes: [{ sourceId: "s", voiceId: "v", pitch: 40, velocity: 1, startTick: 0, durationTick: 4, ticksPerQuarter: 4 }],
    });
    expect(emptyInput.notes).not.toHaveLength(0);
    const empty = buildSourceBasslinePracticeWindow(withoutMiddleNotes, 1, 2);
    expect(empty.ok && empty.window.targetEvents).toEqual([]);
  });

  it("provides bounded navigation and rejects misaligned starts", () => {
    expect(previousSourceBasslineWindowStart(2, 1)).toBeUndefined();
    expect(nextSourceBasslineWindowStart(3, 2, 1)).toBe(3);
    expect(nextSourceBasslineWindowStart(3, 2, 3)).toBeUndefined();
    expect(buildSourceBasslinePracticeWindow(snapshot(), 2, 2)).toEqual({ ok: false, reason: "invalid-window" });
  });
});
