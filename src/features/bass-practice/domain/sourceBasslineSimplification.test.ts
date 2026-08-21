import { describe, expect, it } from "vitest";
import { extractSourceBasslineSnapshot, type ExactCapturedHarmonyInput, type SourceBasslineSnapshotV1 } from "../../../domain/sourceBassline";
import { buildSourceBasslinePracticeWindow } from "./sourceBasslinePractice";

const SOURCE_ID = "synthetic-source";
const VOICE_ID = "synthetic-bass";
const RANGE = {
  authority: "raw-integer-ticks" as const,
  constantMeterProven: true as const,
  barAlignmentProven: true as const,
  sourceId: SOURCE_ID,
  startTick: 0,
  endTick: 16,
  sourceEndTick: 16,
  ticksPerQuarter: 4,
  meter: { numerator: 4 as const, denominator: 4 as const },
};

function makeSnapshot(
  notes: readonly { readonly pitch: number; readonly startTick: number; readonly durationTick?: number }[],
  spans?: ExactCapturedHarmonyInput["spans"],
): SourceBasslineSnapshotV1 {
  return extractSourceBasslineSnapshot({
    selectedSourceId: SOURCE_ID,
    selectedVoiceId: VOICE_ID,
    range: RANGE,
    notes: notes.map((note) => ({
      sourceId: SOURCE_ID,
      voiceId: VOICE_ID,
      pitch: note.pitch,
      velocity: 0.8,
      startTick: note.startTick,
      durationTick: note.durationTick ?? 2,
      ticksPerQuarter: 4,
    })),
    ...(spans ? {
      capturedHarmony: {
        authority: "raw-integer-ticks" as const,
        sourceId: SOURCE_ID,
        rangeStartTick: 0,
        rangeEndTick: 16,
        ticksPerQuarter: 4,
        spans,
      },
    } : {}),
  });
}

function harmony(startTick: number, durationTick: number, root: number, quality: "maj7" | "dom7" = "maj7") {
  return {
    sourceId: SOURCE_ID,
    startTick,
    durationTick,
    ticksPerQuarter: 4,
    chord: { root, quality, tensions: [], label: "Synthetic chord" },
  };
}

describe("Source Bassline deterministic Level 1/2 derivation", () => {
  it("maps Level 1 to the nearest playable captured root and resolves equal-distance ties lower", () => {
    const snapshot = makeSnapshot([{ pitch: 34, startTick: 0 }], [harmony(0, 16, 4)]);
    const before = JSON.stringify(snapshot);
    const result = buildSourceBasslinePracticeWindow(snapshot, 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.window.levels[1]).toMatchObject({
      available: true,
      pitchReplacementCount: 1,
      targetEvents: [expect.objectContaining({ midiNote: 28, startBeat: 0, durationBeats: 0.5 })],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("keeps a legal Level 2 note and maps an illegal note with the lower tie winner", () => {
    const snapshot = makeSnapshot([
      { pitch: 43, startTick: 0 },
      { pitch: 42, startTick: 4 },
    ], [harmony(0, 16, 7, "dom7")]);
    const result = buildSourceBasslinePracticeWindow(snapshot, 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const level2 = result.window.levels[2];
    expect(level2.available).toBe(true);
    if (!level2.available) return;

    expect(level2.targetEvents.map(({ midiNote }) => midiNote)).toEqual([43, 41]);
    expect(level2.pitchReplacementCount).toBe(1);
  });

  it("uses the next half-open harmony span at an exact boundary onset", () => {
    const snapshot = makeSnapshot([{ pitch: 41, startTick: 8 }], [
      harmony(0, 8, 0),
      harmony(8, 8, 2),
    ]);
    const result = buildSourceBasslinePracticeWindow(snapshot, 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const level1 = result.window.levels[1];
    expect(level1.available && level1.targetEvents[0]?.midiNote).toBe(38);
  });

  it("makes the whole simplified level unavailable for missing harmony or an onset gap", () => {
    const missing = buildSourceBasslinePracticeWindow(makeSnapshot([{ pitch: 40, startTick: 0 }]), 1, 1);
    expect(missing.ok && missing.window.levels[1]).toEqual({ available: false, level: 1, reason: "missing-harmony" });
    expect(missing.ok && missing.window.levels[2]).toEqual({ available: false, level: 2, reason: "missing-harmony" });

    const gap = buildSourceBasslinePracticeWindow(makeSnapshot(
      [{ pitch: 40, startTick: 0 }, { pitch: 45, startTick: 8 }],
      [harmony(0, 4, 0)],
    ), 1, 1);
    expect(gap.ok && gap.window.levels[1]).toEqual({ available: false, level: 1, reason: "harmony-gap" });
    expect(gap.ok && gap.window.levels[2]).toEqual({ available: false, level: 2, reason: "harmony-gap" });
  });

  it("allows a captured-harmony gap when no projected event starts inside it", () => {
    const result = buildSourceBasslinePracticeWindow(makeSnapshot(
      [{ pitch: 43, startTick: 0 }],
      [harmony(0, 4, 0), harmony(8, 8, 7, "dom7")],
    ), 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.window.levels[1]).toMatchObject({ available: true, pitchReplacementCount: 1 });
    expect(result.window.levels[2]).toMatchObject({ available: true, pitchReplacementCount: 0 });
  });
  it("distinguishes a projected onset gap from an empty selected window", () => {
    const makeTwoBarSnapshot = (noteStartTick: number) => extractSourceBasslineSnapshot({
      selectedSourceId: SOURCE_ID,
      selectedVoiceId: VOICE_ID,
      range: {
        ...RANGE,
        endTick: 32,
        sourceEndTick: 32,
      },
      notes: [{
        sourceId: SOURCE_ID,
        voiceId: VOICE_ID,
        pitch: 43,
        velocity: 0.8,
        startTick: noteStartTick,
        durationTick: 2,
        ticksPerQuarter: 4,
      }],
      capturedHarmony: {
        authority: "raw-integer-ticks",
        sourceId: SOURCE_ID,
        rangeStartTick: 0,
        rangeEndTick: 32,
        ticksPerQuarter: 4,
        spans: [harmony(0, 16, 0)],
      },
    });

    const onsetInGap = buildSourceBasslinePracticeWindow(makeTwoBarSnapshot(16), 1, 2);
    expect(onsetInGap.ok && onsetInGap.window.levels[1]).toEqual({ available: false, level: 1, reason: "harmony-gap" });
    expect(onsetInGap.ok && onsetInGap.window.levels[2]).toEqual({ available: false, level: 2, reason: "harmony-gap" });

    const emptyWindow = buildSourceBasslinePracticeWindow(makeTwoBarSnapshot(0), 1, 2);
    expect(emptyWindow.ok).toBe(true);
    if (!emptyWindow.ok) return;
    expect(emptyWindow.window.levels[1]).toMatchObject({ available: true, targetEvents: [] });
    expect(emptyWindow.window.levels[2]).toMatchObject({ available: true, targetEvents: [] });
  });
  it("walks dense sorted projected events and harmony spans deterministically", () => {
    const count = 2_048;
    const ticksPerQuarter = count / 4;
    const snapshot = extractSourceBasslineSnapshot({
      selectedSourceId: SOURCE_ID,
      selectedVoiceId: VOICE_ID,
      range: {
        ...RANGE,
        endTick: count,
        sourceEndTick: count,
        ticksPerQuarter,
      },
      notes: Array.from({ length: count }, (_, startTick) => ({
        sourceId: SOURCE_ID,
        voiceId: VOICE_ID,
        pitch: 40 + (startTick % 12),
        velocity: 0.8,
        startTick,
        durationTick: 1,
        ticksPerQuarter,
      })),
      capturedHarmony: {
        authority: "raw-integer-ticks",
        sourceId: SOURCE_ID,
        rangeStartTick: 0,
        rangeEndTick: count,
        ticksPerQuarter,
        spans: Array.from({ length: count }, (_, startTick) => ({
          sourceId: SOURCE_ID,
          startTick,
          durationTick: 1,
          ticksPerQuarter,
          chord: { root: startTick % 12, quality: "maj7" as const, tensions: [], label: "Synthetic chord" },
        })),
      },
    });

    const result = buildSourceBasslinePracticeWindow(snapshot, 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.levels[1].available && result.window.levels[1].targetEvents).toHaveLength(count);
    expect(result.window.levels[2].available && result.window.levels[2].targetEvents).toHaveLength(count);
  });
  it("preserves Level 3 and difference facts independently from simplification availability", () => {
    const result = buildSourceBasslinePracticeWindow(makeSnapshot([
      { pitch: 48, startTick: 0, durationTick: 8 },
      { pitch: 43, startTick: 0, durationTick: 4 },
      { pitch: 45, startTick: 2, durationTick: 4 },
    ]), 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.window.levels[3]).toMatchObject({
      available: true,
      pitchReplacementCount: 0,
      targetEvents: result.window.targetEvents,
    });
    expect(result.window).toMatchObject({
      croppedSourceNoteCount: 3,
      omittedSimultaneousNoteCount: 1,
      overlapClippedNoteCount: 1,
    });
  });
});