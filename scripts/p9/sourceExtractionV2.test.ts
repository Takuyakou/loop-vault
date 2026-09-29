import { describe, expect, it } from "vitest";
import type { TimedNote } from "../../src/domain/midi/types";
import { extractSourceV2 } from "./sourceExtractionV2";
const n = (pitch: number, startTick: number, durationTick: number, channel = 0): TimedNote =>
  ({ pitch, startTick, durationTick, velocity: 80, trackIndex: 0, channel });

describe("P9.3 reversible source extraction research", () => {
  it("keeps half-beat passing harmony as a complete short window", () => {
    const source = [n(48, 0, 480), n(52, 0, 480), n(55, 0, 480),
      n(49, 480, 240), n(53, 480, 240), n(56, 480, 240)];
    const result = extractSourceV2(source, 480, { startBeat: 1, endBeat: 1.5 }, []);
    expect(result.selected).toEqual([49, 53, 56]);
    expect(result.sourceTruth).toHaveLength(source.length);
  });
  it("proposes delayed support without borrowing Gold or a chord label", () => {
    const source = [n(48, 0, 480), n(60, 0, 480), n(64, 120, 360), n(67, 240, 240)];
    const result = extractSourceV2(source, 480, { startBeat: 0, endBeat: 1 }, []);
    expect(result.candidates.some((candidate) => candidate.midiNotes.join() === "48,60,64")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.midiNotes.join() === "48,60,64,67")).toBe(true);
  });
  it("keeps every excluded note addressable and restorable", () => {
    const source = [n(48, 0, 480), n(60, 0, 480), n(77, 0, 480), n(36, 0, 480, 9)];
    const result = extractSourceV2(source, 480, { startBeat: 0, endBeat: 1 }, [], [48, 60], "PRODUCT");
    expect(result.selected).toEqual([48, 60]);
    expect(result.excluded.map((item) => item.id)).toEqual(["n2", "n3"]);
    expect(result.excluded.every((item) => item.restorable
      && result.sourceTruth.some((sourceNote) => sourceNote.id === item.id))).toBe(true);
    expect(result.sourceTruth.map((item) => [item.pitch, item.onsetTick, item.offsetTick]))
      .toEqual([[48, 0, 480], [60, 0, 480], [77, 0, 480], [36, 0, 480]]);
  });
  it("guarded policy never removes a Product note", () => {
    const source = [n(36, 0, 960), n(60, 480, 480), n(64, 480, 480), n(76, 720, 30)];
    const result = extractSourceV2(source, 480, { startBeat: 1, endBeat: 2 }, [], [36, 60, 64], "PRODUCT_GUARDED");
    expect([36, 60, 64].every((pitch) => result.selected.includes(pitch))).toBe(true);
  });
});
