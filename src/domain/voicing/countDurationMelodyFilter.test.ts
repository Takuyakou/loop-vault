import { describe, expect, it } from "vitest";
import type { Voice } from "../midi/types";
import { filterCountDurationMelodyContamination } from "./countDurationMelodyFilter";

const melodyVoice = voice("1:2", 1, 2, "melody", 0.9, 1);
const harmonyVoice = voice("0:0", 0, 0, "harmony", 0.9, 4);
const input = {
  chord: { root: 0, quality: "maj" as const, tensions: [], label: "C" },
  segment: { startBeat: 0, endBeat: 4 },
  ticksPerBeat: 480,
  voices: [melodyVoice, harmonyVoice],
  notes: [
    note(65, 1, 1, 1, 2),
    note(60, 0.8, 0.1, 0, 0),
    note(64, 1.2, 0.25, 0, 0),
    note(67, 1.55, 0.35, 0, 0),
  ],
};

describe("count-duration melody filter", () => {
  it("sums strongest overlap duration for each distinct support pitch", () => {
    const result = filterCountDurationMelodyContamination(input, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumSupportMass: 0.4,
    });

    expect(result.removed.map((entry) => entry.note.pitch)).toEqual([65]);
    const evidence = result.evidenceByNote.get(input.notes[0]!);
    expect(evidence).toMatchObject({
      supportPitches: [64, 67],
      supportPitchCount: 2,
    });
    expect(evidence?.supportMass).toBeCloseTo(0.6);
  });

  it("does not use relative texture coverage or bass-role repair", () => {
    const strict = filterCountDurationMelodyContamination(input, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumSupportMass: 0.7,
    });
    const bassInput = {
      ...input,
      voices: [voice("1:2", 1, 2, "bass", 0.9, 1), harmonyVoice],
    };

    expect(strict.removed).toEqual([]);
    expect(filterCountDurationMelodyContamination(bassInput, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumSupportMass: 0.2,
    }).removed).toEqual([]);
  });
});

function note(
  pitch: number,
  startBeat: number,
  durationBeats: number,
  trackIndex: number,
  channel: number,
) {
  return {
    pitch,
    startTick: startBeat * 480,
    durationTick: durationBeats * 480,
    velocity: 0.8,
    trackIndex,
    channel,
  };
}

function voice(
  id: string,
  trackIndex: number,
  channel: number,
  inferredRole: Voice["inferredRole"],
  roleConfidence: number,
  maxPolyphony: number,
): Voice {
  return {
    id,
    trackIndex,
    channel,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 8,
    pitchRange: [48, 72],
    medianPitch: 60,
    avgDurationTick: 480,
    noteDensity: 1,
    maxPolyphony,
    simultaneousOnsetRatio: 1,
    lowestVoiceShare: 0.1,
    highestVoiceShare: 0.9,
    inferredRole,
    roleConfidence,
    roleEvidence: {
      measured: {
        bass: 0,
        harmony: 0,
        pad: 0,
        melody: 0,
        percussion: 0,
        mixed: 0,
      },
    },
  };
}
