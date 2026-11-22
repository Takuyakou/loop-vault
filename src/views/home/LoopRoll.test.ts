import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import type { ChordTimelineItem, SavedProgressionBlock } from "../../domain/types";
import { resolveTimelineVoicings } from "../../domain/voicing";
import { loopRollNotes, loopRollPosition } from "./LoopRoll";

const item = (label: string, bar: number, beat = 1, durationBeats = 4): ChordTimelineItem => ({
  bar, beat, durationBeats, confidence: 1, alternatives: [], warnings: [], eventId: `e${bar}:${beat}`,
  chord: parseChordLabel(label)!,
});

const block = (chords: ChordTimelineItem[]): SavedProgressionBlock =>
  ({ id: "b", chords, textSource: undefined } as unknown as SavedProgressionBlock);

describe("loopRollNotes (P23-09b)", () => {
  const chords = [item("Dm7", 1), item("G7", 2), item("Cmaj7", 3)];

  it("Q2/C2: one note per sounding note, the same notes ▶ plays", () => {
    const voicings = resolveTimelineVoicings(chords, false);
    const notes = loopRollNotes(block(chords), 8);
    const expected = chords.reduce((sum, chord) => sum + new Set(voicings[chord.eventId!]).size, 0);
    expect(expected).toBeGreaterThan(0);
    expect(notes).toHaveLength(expected);
    for (const [index, chord] of chords.entries()) {
      expect(notes.filter((note) => note.chord === index).map((note) => note.pitch).sort((a, b) => a - b))
        .toEqual([...new Set(voicings[chord.eventId!])].sort((a, b) => a - b));
    }
  });

  it("Q3/C3: the highest note is at the top (0), the lowest at the bottom (1)", () => {
    const notes = loopRollNotes(block(chords), 8);
    const high = Math.max(...notes.map((note) => note.pitch));
    const low = Math.min(...notes.map((note) => note.pitch));
    for (const note of notes) {
      if (note.pitch === high) expect(note.y).toBe(0);
      if (note.pitch === low) expect(note.y).toBe(1);
      expect(note.y).toBeGreaterThanOrEqual(0);
      expect(note.y).toBeLessThanOrEqual(1);
    }
  });

  it("Q8: no notes when no chord has an event id (nothing ▶ would play with voicings)", () => {
    const { eventId: _unused, ...withoutId } = item("C", 1);
    expect(loopRollNotes(block([withoutId as ChordTimelineItem]), 8)).toEqual([]);
    expect(loopRollNotes(block([]), 8)).toEqual([]);
  });

  it("only the chords shown as boxes (the first `limit`) are drawn", () => {
    const many = Array.from({ length: 10 }, (_, index) => item("C", index + 1));
    expect(Math.max(...loopRollNotes(block(many), 8).map((note) => note.chord))).toBe(7);
  });
});

describe("loopRollPosition (P23-09b Q5)", () => {
  const timeline = [item("C", 1, 1, 4), item("F", 2, 1, 2), item("G", 2, 3, 2)];

  it("follows the preview timing: chord and fraction through it", () => {
    expect(loopRollPosition(0, timeline, 8, 120)).toEqual({ chord: 0, fraction: 0 });
    expect(loopRollPosition(1_000, timeline, 8, 120)).toEqual({ chord: 0, fraction: 0.5 });
    expect(loopRollPosition(2_500, timeline, 8, 120)).toEqual({ chord: 1, fraction: 0.5 });
    expect(loopRollPosition(3_000, timeline, 8, 120)).toEqual({ chord: 2, fraction: 0 });
  });

  it("is undefined after the end, before the start and past the chords shown", () => {
    expect(loopRollPosition(4_000, timeline, 8, 120)).toBeUndefined();
    expect(loopRollPosition(-1, timeline, 8, 120)).toBeUndefined();
    expect(loopRollPosition(2_500, timeline, 1, 120)).toBeUndefined();
  });
});
