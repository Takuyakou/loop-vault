import { describe, expect, it } from "vitest";
import type { NormalizedTimedNote, Voice } from "./types";
import { inferVoiceRole } from "./voiceRoles";
import {
  assertRoleV2ShadowLegatoGapBeats,
  extractRoleV2ShadowFeatures,
  roleV2ShadowLegatoGapBeats,
} from "./voiceRoleV2ShadowFeatures";

describe("Role v2 shadow features", () => {
  it("uses the fixed musical-time gap at its threshold and exposes aggregate-only diagnostics", () => {
    const voice = makeVoice();
    const joinedNotes = [
      note(60, 0, 1),
      note(60, 1 + roleV2ShadowLegatoGapBeats, 2),
    ];
    const joined = extractRoleV2ShadowFeatures([voice], joinedNotes).get(voice.id)!;
    const separated = extractRoleV2ShadowFeatures([voice], [
      note(60, 0, 1),
      note(60, 1 + roleV2ShadowLegatoGapBeats + 0.001, 2),
    ]).get(voice.id)!;

    expect(joined).toMatchObject({
      sourceNoteCount: 2,
      proxyNoteCount: 1,
      activeDurationBeats: 2,
      robustDurationBeats: 2,
    });
    expect(separated.proxyNoteCount).toBe(2);
    expect(joined).not.toHaveProperty("legatoProxy");
    expect(extractRoleV2ShadowFeatures([voice], joinedNotes)).toEqual(
      extractRoleV2ShadowFeatures([voice], joinedNotes),
    );
  });

  it("measures monophony by active time rather than note count", () => {
    const voice = makeVoice();
    const features = extractRoleV2ShadowFeatures([voice], [
      note(60, 0, 4),
      note(64, 1, 2),
      note(67, 2, 3),
    ]).get(voice.id)!;

    expect(features.activeDurationBeats).toBe(4);
    expect(features.monophonicActiveDurationBeats).toBe(2);
    expect(features.timeWeightedMonophony).toBe(0.5);
    expect(features.timeWeightedPolyphony).toBe(1.5);
  });

  it("uses private proxy statistics for robust duration and stepwise motion", () => {
    const voice = makeVoice();
    const features = extractRoleV2ShadowFeatures([voice], [
      note(60, 0, 0.25),
      note(60, 0.5, 4.5),
      note(62, 5, 5.5),
      note(74, 6, 6.5),
    ]).get(voice.id)!;

    expect(features.sourceNoteCount).toBe(4);
    expect(features.proxyNoteCount).toBe(3);
    expect(features.robustDurationBeats).toBe(0.5);
    expect(features.stepwiseMotionRatio).toBeCloseTo(0.5);
    expect(features).not.toHaveProperty("legatoProxy");
  });

  it("ranks pitch centres deterministically, shares equal ranks, and excludes Channel 10", () => {
    const low = makeVoice({ id: "0:0", channel: 0 });
    const equalLow = makeVoice({ id: "1:0", trackIndex: 1, channel: 0 });
    const high = makeVoice({ id: "2:0", trackIndex: 2, channel: 0 });
    const drums = makeVoice({ id: "3:9", trackIndex: 3, channel: 9 });
    const features = extractRoleV2ShadowFeatures([high, drums, equalLow, low], [
      note(40, 0, 1, 0),
      note(40, 0, 1, 1),
      note(80, 0, 1, 2),
      note(36, 0, 1, 3, 9),
    ]);

    expect(features.get(low.id)?.pitchCenterRank).toBe(0.25);
    expect(features.get(equalLow.id)?.pitchCenterRank).toBe(0.25);
    expect(features.get(high.id)?.pitchCenterRank).toBe(1);
    expect(features.get(drums.id)?.pitchCenterRank).toBeNull();
  });

  it("keeps program, name, and percussion signals separate and does not make soft evidence hard", () => {
    const voice = makeVoice({
      trackName: "Lead Drum Kit",
      explicitPrograms: [{ program: 112, noteCount: 4, durationTicks: 480 }],
      dominantProgram: 112,
      dominantProgramExplicit: true,
    });
    const features = extractRoleV2ShadowFeatures([voice], [
      note(72, 0, 0.125),
      note(74, 0.25, 0.375),
    ]).get(voice.id)!;

    expect(features.programEvidence).toEqual({
      kind: "explicit-dominant-program", program: 112, role: "percussion", confidence: 0.96,
    });
    expect(features.trackNameEvidence).toEqual([
      { kind: "track-name-hint", role: "percussion", hint: "percussion" },
      { kind: "track-name-hint", role: "melody", hint: "melody" },
    ]);
    expect(features.percussionEvidence).toMatchObject({
      channel10: false,
      gmPercussionProgram: true,
      trackNameHint: true,
      softSignature: { robustDurationBeats: 0.125, noteDensityPerActiveBeat: 8, pitchRange: 2 },
    });
  });

  it("rejects non-finite and negative legato-gap values", () => {
    for (const invalidGap of [Number.NaN, Number.POSITIVE_INFINITY, -0.001]) {
      expect(() => assertRoleV2ShadowLegatoGapBeats(invalidGap)).toThrow(RangeError);
    }
    expect(() => assertRoleV2ShadowLegatoGapBeats(roleV2ShadowLegatoGapBeats)).not.toThrow();
  });

  it("fails closed for non-finite pitches", () => {
    const voice = makeVoice();
    const features = extractRoleV2ShadowFeatures([voice], [
      note(Number.NaN, 0, 1),
      note(Number.POSITIVE_INFINITY, 1, 2),
      note(60, 2, 3),
    ]).get(voice.id)!;

    expect(features).toMatchObject({
      sourceNoteCount: 1,
      proxyNoteCount: 1,
      activeDurationBeats: 1,
      pitchCenter: 60,
      pitchRange: 0,
    });
    expect(features.timeWeightedMonophony).toBe(1);
  });

  it("is deterministic and preserves inputs and the production Role v1 result", () => {
    const voice = makeVoice({
      trackName: "Lead Melody",
      medianPitch: 76,
      highestVoiceShare: 1,
      noteDensity: 2,
    });
    const notes = [note(72, 0, 1), note(74, 1, 2), note(76, 2, 3)];
    const sourceVoices = structuredClone([voice]);
    const sourceNotes = structuredClone(notes);
    const v1Input = {
      voice,
      avgDurationBeats: 1,
      stepwiseMotionRatio: 1,
      repeatedPitchClassRatio: 0,
      sustainRatio: 0,
    };
    const before = inferVoiceRole(v1Input);

    const first = extractRoleV2ShadowFeatures([voice], notes);
    const second = extractRoleV2ShadowFeatures([voice], notes);

    expect(first).toEqual(second);
    expect([voice]).toEqual(sourceVoices);
    expect(notes).toEqual(sourceNotes);
    expect(inferVoiceRole(v1Input)).toEqual(before);
  });
});

function makeVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "0:0",
    trackIndex: 0,
    channel: 0,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 4,
    pitchRange: [60, 64],
    medianPitch: 62,
    avgDurationTick: 480,
    noteDensity: 1,
    maxPolyphony: 1,
    simultaneousOnsetRatio: 0,
    lowestVoiceShare: 0.5,
    highestVoiceShare: 0.5,
    inferredRole: "mixed",
    roleConfidence: 0,
    roleEvidence: {
      measured: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 },
    },
    ...overrides,
  };
}

function note(
  pitch: number,
  startBeat: number,
  endBeat: number,
  trackIndex = 0,
  channel = 0,
): NormalizedTimedNote {
  return {
    pitch,
    startTick: startBeat * 480,
    durationTick: (endBeat - startBeat) * 480,
    velocity: 0.8,
    trackIndex,
    channel,
    sourceTrackIndex: trackIndex,
    isDrum: channel === 9,
    startBeat,
    endBeat,
    sustainedEndBeat: endBeat,
  };
}