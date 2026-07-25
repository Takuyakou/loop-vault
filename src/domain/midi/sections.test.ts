import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { evaluateSegmentation, segmentSections } from "./sections";
import type { MidiSongData, TimedNote } from "./types";

const ticksPerBeat = 480;

function note(pitch: number, bar: number, trackIndex = 0, channel = 0): TimedNote {
  return {
    pitch,
    startTick: (bar - 1) * 4 * ticksPerBeat,
    durationTick: 4 * ticksPerBeat,
    velocity: 0.8,
    trackIndex,
    channel,
  };
}

function song(notes: TimedNote[], totalBars: number, trackCount = 1): MidiSongData {
  return {
    notes,
    ticksPerBeat,
    totalBars,
    timeSignature: "4/4",
    tracks: Array.from({ length: trackCount }, (_, index) => ({ index, name: `t${index}` })),
    controlChanges: [],
  };
}

function timeline(labels: readonly string[]): ChordTimelineItem[] {
  return labels.map((label, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

function repeated(pattern: readonly string[], times: number): string[] {
  return Array.from({ length: times }, () => [...pattern]).flat();
}

/** Triad pitches for a chord label, so notes and timeline agree. */
function chordNotes(label: string, bar: number, trackIndex = 0): TimedNote[] {
  const chord = parseChordLabel(label)!;
  const third = chord.quality.startsWith("min") ? 3 : 4;
  return [0, third, 7].map((interval) => note(48 + ((chord.root + interval) % 12), bar, trackIndex));
}

describe("section segmentation", () => {
  it("splits where the harmonic area changes", () => {
    // Eight bars in one area, then eight bars a tritone away.
    const labels = [...repeated(["C", "Am", "F", "G"], 2), ...repeated(["F#", "Ebm", "B", "C#"], 2)];
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const sections = segmentSections(song(notes, 16), timeline(labels));

    expect(sections.length).toBeGreaterThan(1);
    const boundary = sections[1].startBar;
    expect(boundary).toBeGreaterThanOrEqual(7);
    expect(boundary).toBeLessThanOrEqual(11);
    expect(sections[1].reasons).toContain("harmonic-novelty");
  });

  it("numbers sections instead of naming them", () => {
    const labels = [...repeated(["C", "Am", "F", "G"], 2), ...repeated(["F#", "Ebm", "B", "C#"], 2)];
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const sections = segmentSections(song(notes, 16), timeline(labels));

    for (const section of sections) {
      expect(section.id).toMatch(/^Section \d+$/);
      expect(section.id).not.toMatch(/chorus|verse|bridge|サビ|Aメロ/i);
    }
  });

  it("does not make a short fill its own section", () => {
    const labels = repeated(["C", "Am", "F", "G"], 4);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    // One busy bar in the middle, the shape of a fill.
    notes.push(...[60, 62, 64, 65, 67].map((pitch) => note(pitch, 8)));
    const sections = segmentSections(song(notes, 16), timeline(labels));

    expect(sections.every((section) => section.endBar - section.startBar + 1 >= 4)).toBe(true);
  });

  it("keeps every section at or above the minimum length", () => {
    const labels = repeated(["C", "F#", "C", "F#"], 6);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const sections = segmentSections(song(notes, 24), timeline(labels), { minimumSectionBars: 4 });

    for (const section of sections) {
      expect(section.endBar - section.startBar + 1).toBeGreaterThanOrEqual(4);
    }
  });

  it("covers the whole song without gaps or overlaps", () => {
    const labels = repeated(["C", "Am", "F", "G"], 8);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const sections = segmentSections(song(notes, 32), timeline(labels));

    expect(sections[0].startBar).toBe(1);
    expect(sections[sections.length - 1].endBar).toBe(32);
    for (let index = 1; index < sections.length; index += 1) {
      expect(sections[index].startBar).toBe(sections[index - 1].endBar + 1);
    }
  });

  it("notes an instrumentation change as a reason", () => {
    const labels = repeated(["C", "Am", "F", "G"], 4);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    // A second instrument enters halfway.
    for (let bar = 9; bar <= 16; bar += 1) notes.push(note(72, bar, 1));
    const sections = segmentSections(song(notes, 16, 2), timeline(labels));
    const reasons = sections.flatMap((section) => section.reasons);

    expect(reasons).toContain("instrumentation-change");
  });

  it("summarises activity and chroma per section", () => {
    const labels = repeated(["C", "Am", "F", "G"], 4);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const [first] = segmentSections(song(notes, 16), timeline(labels));

    expect(first.activitySummary.noteCount).toBeGreaterThan(0);
    expect(first.chromaSummary.distribution).toHaveLength(12);
    expect(Number(first.chromaSummary.distribution.reduce((sum, value) => sum + value, 0).toFixed(3)))
      .toBeCloseTo(1, 2);
  });

  it("returns a single section for a uniform song", () => {
    const labels = repeated(["C"], 16);
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const sections = segmentSections(song(notes, 16), timeline(labels));
    expect(sections).toHaveLength(1);
  });

  it("is deterministic", () => {
    const labels = [...repeated(["C", "Am", "F", "G"], 2), ...repeated(["F#", "Ebm", "B", "C#"], 2)];
    const notes = labels.flatMap((label, index) => chordNotes(label, index + 1));
    const data = song(notes, 16);
    expect(segmentSections(data, timeline(labels))).toEqual(segmentSections(data, timeline(labels)));
  });
});

describe("segmentation quality", () => {
  it("scores boundaries against a reference within tolerance", () => {
    const sections = [
      { startBar: 1, endBar: 8 },
      { startBar: 9, endBar: 16 },
      { startBar: 17, endBar: 24 },
    ].map((range, index) => ({
      id: `Section ${index + 1}`,
      ...range,
      confidence: 1,
      reasons: [],
      activitySummary: {
        noteCount: 0, averagePolyphony: 0, averageDuration: 0,
        bassNotes: 0, percussionNotes: 0, distinctPitchClasses: 0,
      },
      chromaSummary: { distribution: Array(12).fill(0), dominantPitchClass: 0 },
    }));

    const exact = evaluateSegmentation(sections, [9, 17]);
    expect(exact.boundaryPrecision).toBe(1);
    expect(exact.boundaryRecall).toBe(1);

    const missed = evaluateSegmentation(sections, [9, 17, 33]);
    expect(missed.boundaryRecall).toBeLessThan(1);
    expect(missed.underSegmentationRate).toBeGreaterThan(0);
  });
});
