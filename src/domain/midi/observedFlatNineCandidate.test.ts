import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { parseChordLabel } from "../chords";
import { noteNameFromPitchClass } from "../chords";
import { analyzeMidiPhase4 } from "./phase4Analyzer";
import { addObservedFlatNineDominantCandidate } from "./observedFlatNineCandidate";

function chord(label: string) {
  return parseChordLabel(label)!;
}

function histogramFor(root: number, intervals: readonly number[]): number[] {
  const histogram = Array(12).fill(0) as number[];
  intervals.forEach((interval) => {
    histogram[(root + interval) % 12] = 1;
  });
  return histogram;
}

describe("observed flat-nine dominant Product candidate", () => {
  const baseline = [
    { chord: chord("Cm"), confidence: 0.9 },
    { chord: chord("F"), confidence: 0.8 },
    { chord: chord("Am7"), confidence: 0.7 },
  ];

  it("generates E1 in all 12 keys without changing the existing Top-3", () => {
    for (let root = 0; root < 12; root += 1) {
      const source = chord(`${noteNameFromPitchClass(root)}7`);
      const result = addObservedFlatNineDominantCandidate(
        chord("Dm"),
        baseline,
        [{ chord: source, rawScore: 1.2 }],
        histogramFor(root, [0, 1, 4, 7, 10]),
      );
      expect(result.slice(0, 2)).toEqual(baseline.slice(0, 2));
      expect(result[2]?.chord.label).toBe(`${noteNameFromPitchClass(root)}7(b9)`);
    }
  });

  it("requires the complete dominant core and observed b9", () => {
    const source = chord("A7");
    expect(addObservedFlatNineDominantCandidate(
      chord("Dm"),
      baseline,
      [{ chord: source, rawScore: 1 }],
      histogramFor(9, [0, 4, 10, 1]),
    )).toEqual(baseline);
    expect(addObservedFlatNineDominantCandidate(
      chord("Dm"),
      baseline,
      [{ chord: source, rawScore: 1 }],
      histogramFor(9, [0, 4, 7, 10]),
    )).toEqual(baseline);
  });

  it("does not duplicate an existing canonical 7(b9) and is deterministic", () => {
    const existing = [
      ...baseline,
      { chord: chord("A7(b9)"), confidence: 0.6 },
    ];
    const input = [{ chord: chord("A7"), rawScore: 1.25 }];
    const histogram = histogramFor(9, [0, 1, 4, 7, 10]);
    const first = addObservedFlatNineDominantCandidate(
      chord("Dm"),
      existing,
      input,
      histogram,
    );
    const second = addObservedFlatNineDominantCandidate(
      chord("Dm"),
      existing,
      input,
      histogram,
    );
    expect(first).toEqual(existing);
    expect(second).toEqual(first);
  });

  it("is called by Product analysis and can be rolled back without changing rank 1", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    [57, 61, 64, 67, 70].forEach((pitch) => {
      track.addNote({ midi: pitch, time: 0, duration: 2, velocity: 0.8 });
    });
    const bytes = new Uint8Array(midi.toArray());
    const off = analyzeMidiPhase4(bytes, {
      accuracyFirst: { enableObservedFlatNineDominantCandidate: false },
    });
    const on = analyzeMidiPhase4(bytes, {
      accuracyFirst: { enableObservedFlatNineDominantCandidate: true },
    });

    expect(on.fullTimeline[0]?.chord).toEqual(off.fullTimeline[0]?.chord);
    expect(on.fullTimeline[0]?.confidence).toBe(off.fullTimeline[0]?.confidence);
    expect(on.fullTimeline[0]?.alternatives.slice(0, 2))
      .toEqual(off.fullTimeline[0]?.alternatives.slice(0, 2));
    expect(on.fullTimeline[0]?.alternatives.some((entry) => entry.chord.label === "A7(b9)"))
      .toBe(true);
    expect(off.fullTimeline[0]?.alternatives.some((entry) => entry.chord.label === "A7(b9)"))
      .toBe(false);
  });
});
