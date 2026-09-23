import { describe, expect, it } from "vitest";

import type { MidiSongData } from "../../src/domain/midi/types";
import { chordFixture } from "../p534/fixtures";
import {
  buildGroundTruthPacket,
  buildBlindRegionEvidence,
  renderBlindChoices,
  renderBlindReview,
} from "./groundTruthPacket";

describe("P5.39-03a blind ground-truth packet", () => {
  it("selects changed windows but keeps labels and scores out of source evidence", () => {
    const bytes = chordFixture([48, 51, 52, 56, 58], {
      ticksPerBeat: 96,
      numerator: 4,
      denominator: 4,
    });
    // The private runner requires exactly two changed windows. A one-window
    // synthetic source must fail closed instead of inventing a second target.
    expect(() => buildGroundTruthPacket(bytes)).toThrow(/exactly two changed/);
  });

  it("renders source-only evidence separately from anonymous candidate choices", () => {
    const region = {
      id: "FC-REAL-01" as const,
      contextBeforeBeats: 1,
      targetDurationBeats: 2,
      contextAfterBeats: 1,
      lowestTargetPitchClass: 0,
      notes: [{ midiPitch: 60, onsetBeats: 0, durationBeats: 1, velocity: 90,
        voice: 1, carriedIntoContext: false }],
      slices: [{ relativeBeat: 0, pitchClassesAboveLowestTarget: [0],
        lowestMidiPitch: 60, attackCount: 1 }],
    };
    const binding = {
      id: "FC-REAL-01" as const,
      windowIndex: 1,
      startBeat: 2,
      choices: {
        A: { origin: "legacy" as const, label: "C7" },
        B: { origin: "shadow" as const, label: "C11(no5)" },
      },
    };
    const source = renderBlindReview([region]);
    const choices = renderBlindChoices([binding]);
    expect(source).toContain("MIDI pitch");
    expect(source).not.toContain("C7");
    expect(source).not.toContain("C11(no5)");
    expect(source).not.toMatch(/legacy|shadow|score|rank/i);
    expect(choices).toContain("A: C7");
    expect(choices).toContain("B: C11(no5)");
    expect(choices).not.toMatch(/legacy|shadow|score|rank/i);
  });

  it("preserves crossing notes, onset context, and independent bass evidence", () => {
    const source: MidiSongData = {
      notes: [
        { pitch: 48, startTick: 48, durationTick: 192, velocity: 90, trackIndex: 0 },
        { pitch: 60, startTick: 192, durationTick: 96, velocity: 80, trackIndex: 1 },
        { pitch: 64, startTick: 288, durationTick: 96, velocity: 80, trackIndex: 1 },
      ],
      ticksPerBeat: 96,
      totalBars: 4,
      tracks: [],
      controlChanges: [],
    };
    const before = structuredClone(source);
    const region = buildBlindRegionEvidence(source, 2, "FC-REAL-01");
    expect(region.notes).toEqual([
      { midiPitch: 48, onsetBeats: -1, durationBeats: 1.5, velocity: 90,
        voice: 1, carriedIntoContext: true },
      { midiPitch: 60, onsetBeats: 0, durationBeats: 1, velocity: 80,
        voice: 2, carriedIntoContext: false },
      { midiPitch: 64, onsetBeats: 1, durationBeats: 1, velocity: 80,
        voice: 2, carriedIntoContext: false },
    ]);
    expect(region.slices.find((slice) => slice.relativeBeat === 0)?.lowestMidiPitch).toBe(48);
    expect(region.slices.find((slice) => slice.relativeBeat === 1)?.attackCount).toBe(1);
    expect(source).toEqual(before);
  });
});
