import { describe, expect, it } from "vitest";
import type { NormalizedTimedNote, Voice, VoiceFeatureInput, VoiceRoleInference } from "./types";
import {
  buildVoiceAwarePitchProfile,
  buildVoiceRoleProfiles,
  contributionWeightsForRole,
  type VoiceRoleProfile,
} from "./voiceProfiles";

describe("Voice evidence profiles", () => {
  it("defines separate root, bass, quality, and tension contribution axes", () => {
    expect(contributionWeightsForRole("bass")).toEqual({ root: 0.9, bass: 1, quality: 0.25, tension: 0 });
    expect(contributionWeightsForRole("harmony")).toEqual({ root: 0.65, bass: 0.35, quality: 1, tension: 0.55 });
    expect(contributionWeightsForRole("pad")).toEqual({ root: 0.6, bass: 0.2, quality: 0.8, tension: 0.55 });
    expect(contributionWeightsForRole("melody")).toEqual({ root: 0.15, bass: 0, quality: 0.22, tension: 0.35 });
    expect(contributionWeightsForRole("percussion")).toEqual({ root: 0, bass: 0, quality: 0, tension: 0 });
    expect(contributionWeightsForRole("mixed")).toEqual({ root: 0.35, bass: 0.15, quality: 0.45, tension: 0.25 });
  });

  it("keeps same-channel notes in one Voice while strengthening low-note bass/root evidence", () => {
    const roles = new Map<string, VoiceRoleProfile>([["0:0", profile("harmony")]]);
    const lowG = note(43, 0, 2);
    const highE = note(64, 0, 2);

    const evidence = buildVoiceAwarePitchProfile(
      [lowG, highE],
      { startBeat: 0, endBeat: 2 },
      roles,
      new Map(),
      4,
    );

    expect(evidence.bassEvidence[7]).toBeGreaterThan(evidence.bassEvidence[4]);
    expect(evidence.rootEvidence[7]).toBeGreaterThan(evidence.qualityEvidence[7]);
    expect(evidence.qualityEvidence[4]).toBeGreaterThan(evidence.bassEvidence[4]);
    expect(evidence.tensionEvidence[7]).toBe(0);
  });

  it("gives channel 9 zero contribution even when its resolved role is harmony", () => {
    const roles = new Map<string, VoiceRoleProfile>([["0:9", profile("harmony")]]);
    const channelNine = note(36, 0, 1, 9);

    const evidence = buildVoiceAwarePitchProfile(
      [channelNine],
      { startBeat: 0, endBeat: 1 },
      roles,
      new Map(),
      4,
    );

    expect(Object.values(evidence).flat().every((value) => value === 0)).toBe(true);
  });

  it("lets a non-channel-9 GM percussion Voice re-enter evidence through a role override", () => {
    const voice: Voice = {
      ...makeVoice(),
      explicitPrograms: [{ program: 112, noteCount: 1, durationTicks: 480 }],
      dominantProgram: 112,
      dominantProgramExplicit: true,
    };
    const input: VoiceFeatureInput = {
      voice,
      avgDurationBeats: 1,
      stepwiseMotionRatio: 0,
      repeatedPitchClassRatio: 0,
      sustainRatio: 0,
    };
    const gmPercussion = {
      ...note(60, 0, 1),
      program: 112,
      programExplicit: true,
    };
    const automaticRoles = buildVoiceRoleProfiles([voice], new Map([[voice.id, input]]));
    const overriddenRoles = buildVoiceRoleProfiles(
      [voice],
      new Map([[voice.id, input]]),
      { [voice.id]: "harmony" },
    );
    const automaticEvidence = buildVoiceAwarePitchProfile(
      [gmPercussion],
      { startBeat: 0, endBeat: 1 },
      automaticRoles,
      new Map(),
      4,
    );
    const overriddenEvidence = buildVoiceAwarePitchProfile(
      [gmPercussion],
      { startBeat: 0, endBeat: 1 },
      overriddenRoles,
      new Map(),
      4,
    );

    expect(automaticRoles.get(voice.id)).toMatchObject({
      inference: { role: "percussion" },
      contribution: contributionWeightsForRole("percussion"),
    });
    expect(Object.values(automaticEvidence).flat().every((value) => value === 0)).toBe(true);
    expect(overriddenRoles.get(voice.id)).toMatchObject({
      inference: { role: "harmony", confidence: 1 },
      contribution: contributionWeightsForRole("harmony"),
    });
    expect(overriddenEvidence.qualityEvidence[0]).toBeGreaterThan(0);
  });

  it("builds deterministic profiles and applies non-percussion overrides", () => {
    const voice = makeVoice();
    const input: VoiceFeatureInput = {
      voice,
      avgDurationBeats: 1,
      stepwiseMotionRatio: 0,
      repeatedPitchClassRatio: 0,
      sustainRatio: 0,
    };

    const first = buildVoiceRoleProfiles([voice], new Map([[voice.id, input]]), { [voice.id]: "melody" });
    const second = buildVoiceRoleProfiles([voice], new Map([[voice.id, input]]), { [voice.id]: "melody" });

    expect(first).toEqual(second);
    expect(first.get(voice.id)).toMatchObject({
      inference: { role: "melody", confidence: 1 },
      contribution: contributionWeightsForRole("melody"),
    });
  });
});

function profile(role: VoiceRoleInference["role"]): VoiceRoleProfile {
  return {
    voiceId: role === "percussion" ? "0:9" : "0:0",
    inference: {
      role,
      confidence: 1,
      scores: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0, [role]: 1 },
      reasons: [`test:${role}`],
    },
    contribution: contributionWeightsForRole(role),
  };
}

function makeVoice(): Voice {
  return {
    id: "0:0",
    trackIndex: 0,
    channel: 0,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 1,
    pitchRange: [60, 60],
    medianPitch: 60,
    avgDurationTick: 480,
    noteDensity: 1,
    maxPolyphony: 1,
    simultaneousOnsetRatio: 0,
    lowestVoiceShare: 1,
    highestVoiceShare: 1,
    inferredRole: "mixed",
    roleConfidence: 0,
    roleEvidence: {
      measured: { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 },
    },
  };
}

function note(pitch: number, startBeat: number, endBeat: number, channel = 0): NormalizedTimedNote {
  return {
    pitch,
    startTick: startBeat * 480,
    durationTick: (endBeat - startBeat) * 480,
    velocity: 1,
    trackIndex: 0,
    channel,
    sourceTrackIndex: 0,
    isDrum: channel === 9,
    startBeat,
    endBeat,
    sustainedEndBeat: endBeat,
  };
}
