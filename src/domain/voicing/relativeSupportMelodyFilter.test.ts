import { describe, expect, it } from "vitest";
import type { Voice } from "../midi/types";
import { filterRelativeSupportMelodyContamination } from "./relativeSupportMelodyFilter";

const melodyVoice = voice("1:2", 1, 2, "melody", 0.9, 1);
const harmonyVoice = voice("0:0", 0, 0, "harmony", 0.9, 4);
const input = {
  chord: { root: 0, quality: "maj" as const, tensions: [], label: "C" },
  segment: { startBeat: 0, endBeat: 4 },
  ticksPerBeat: 480,
  voices: [melodyVoice, harmonyVoice],
  notes: [
    note(65, 1, 0.5, 1, 2),
    note(60, 0.8, 1, 0, 0),
    note(64, 2, 1, 0, 0),
    note(67, 2.2, 1, 0, 0),
    note(71, 2.4, 1, 0, 0),
  ],
};

describe("relative support melody filter", () => {
  it("uses target-local support as a ratio of event texture", () => {
    const result = filterRelativeSupportMelodyContamination(input, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.25,
      minimumSupportBeats: 0.2,
    });

    expect(result.removed.map((entry) => entry.note.pitch)).toEqual([65]);
    expect(result.evidenceByNote.get(input.notes[0]!)?.supportCoverageRatio).toBe(0.25);
  });

  it("does not mix in count-duration mass or bass-role repair", () => {
    const strict = filterRelativeSupportMelodyContamination(input, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.5,
      minimumSupportBeats: 0.2,
    });
    const bassInput = {
      ...input,
      voices: [voice("1:2", 1, 2, "bass", 0.9, 1), harmonyVoice],
    };

    expect(strict.removed).toEqual([]);
    expect(filterRelativeSupportMelodyContamination(bassInput, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.25,
      minimumSupportBeats: 0.2,
    }).removed).toEqual([]);
  });

  it("supports A1-prime without an absolute duration gate", () => {
    const shortSupportInput = {
      ...input,
      notes: [
        note(65, 1, 0.18, 1, 2),
        note(60, 1, 0.18, 0, 0),
        note(64, 1, 0.18, 0, 0),
        note(67, 1, 0.18, 0, 0),
        note(71, 1, 0.18, 0, 0),
      ],
    };

    const a1 = filterRelativeSupportMelodyContamination(shortSupportInput, {
      minimumRoleConfidence: 0.65,
      minimumSupportPitchCount: 1,
      minimumCoverageRatio: 0.25,
      minimumSupportBeats: 0.2,
    });
    const a1Prime = filterRelativeSupportMelodyContamination(
      shortSupportInput,
      {
        minimumRoleConfidence: 0.65,
        minimumSupportPitchCount: 1,
        minimumCoverageRatio: 0.25,
      },
    );

    expect(a1.removed).toEqual([]);
    expect(a1Prime.removed.map((entry) => entry.note.pitch)).toEqual([65]);
    expect(a1Prime.removed[0]?.reasons).toContain("duration-gate:disabled");
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
