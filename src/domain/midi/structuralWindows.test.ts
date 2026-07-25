import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { structuralWindows } from "./structuralWindows";

/**
 * Windows derived from the material, not from a list of lengths.
 *
 * The fixed set 2/4/8/16 cannot express a fourteen-bar section. Adding 14 to the
 * list would fix one corpus and leave the next thirteen-bar bridge unreachable,
 * so these tests check that a span is found because the music says so.
 */

function chord(root: number) {
  const symbol = makeChordSymbol(root, "maj7", []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

/** One chord per bar, from a repeating palette. */
function timelineOf(palette: readonly number[], bars: number, fromBar = 1): ChordTimelineItem[] {
  return Array.from({ length: bars }, (_unused, index) => ({
    bar: fromBar + index,
    beat: 1,
    durationBeats: 4,
    chord: chord(palette[index % palette.length]),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

describe("structural windows", () => {
  it("does not re-emit the lengths the fixed generator already covers", () => {
    const windows = structuralWindows(timelineOf([0, 5, 7], 32), 32, 4);

    expect(windows.every((window) => ![2, 4, 8, 16].includes(window.lengthBars))).toBe(true);
  });

  it("emits a section's exact span whatever length it happens to be", () => {
    const timeline = [...timelineOf([0, 5, 7, 9], 14), ...timelineOf([1, 6, 8, 10], 18, 15)];
    const sections = [
      { id: "a", startBar: 1, endBar: 14 },
      { id: "b", startBar: 15, endBar: 32 },
    ];
    const windows = structuralWindows(timeline, 32, 4, sections as never);

    expect(windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ startBar: 1, lengthBars: 14 }),
      expect.objectContaining({ startBar: 15, lengthBars: 18 }),
    ]));
  });

  it("recovers a span the segmenter merged, by joining its neighbours", () => {
    // The segmenter reports two four-bar sections where the music has one
    // eleven-bar area. Joining adjacent boundaries finds the span anyway.
    const timeline = timelineOf([0, 5, 7], 24);
    const sections = [
      { id: "a", startBar: 1, endBar: 4 },
      { id: "b", startBar: 5, endBar: 11 },
      { id: "c", startBar: 12, endBar: 24 },
    ];
    const windows = structuralWindows(timeline, 24, 4, sections as never);

    expect(windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ startBar: 1, lengthBars: 11 }),
    ]));
  });

  it("finds a five-bar repeat cycle", () => {
    const windows = structuralWindows(timelineOf([0, 2, 4, 5, 7], 30), 30, 4);
    const cycle = windows.find((window) => window.lengthBars === 5);

    expect(cycle).toBeDefined();
  });

  it("finds the span that ends where its opening chord returns", () => {
    // C ... returns at bar 8, so bars 1-7 is a closed loop of seven bars.
    const windows = structuralWindows(timelineOf([0, 2, 4, 5, 7, 9, 11], 28), 28, 4);

    expect(windows.some(
      (window) => window.startBar === 1 && window.lengthBars === 7,
    )).toBe(true);
  });

  it("stays inside the song", () => {
    const windows = structuralWindows(timelineOf([0, 5, 7], 20), 20, 4);

    expect(windows.every((window) => window.startBar >= 1
      && window.startBar + window.lengthBars - 1 <= 20)).toBe(true);
  });

  it("produces the same windows on a rerun", () => {
    const timeline = timelineOf([0, 5, 7, 9, 2], 40);
    const first = structuralWindows(timeline, 40, 4);
    const second = structuralWindows(timeline, 40, 4);

    expect(second).toEqual(first);
  });
});
