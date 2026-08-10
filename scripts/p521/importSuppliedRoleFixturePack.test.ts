import { describe, expect, it } from "vitest";
import {
  applyFixtureDefinedExpectedRoles,
  calculateRoleBaseline,
  parseSuppliedVoiceKey,
  type ApprovedFixtureRegistry,
} from "./importSuppliedRoleFixturePack";
import type { GroundTruthTemplate } from "./roleGroundTruthTemplate";

function template(): GroundTruthTemplate {
  return {
    schemaVersion: 1,
    kind: "p521-role-ground-truth-template",
    fixture: { id: "fixture-123456781234", sourceIdentity: "local-midi-not-recorded" },
    expectedRoleOptions: ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"],
    reviewPolicy: [],
    voices: [
      voice(0, 0, "mixed"),
      voice(1, 9, "percussion"),
    ],
  };
}

function voice(trackIndex: number, channelIndex: number, currentAutomaticRole: "bass" | "harmony" | "pad" | "melody" | "percussion" | "mixed") {
  return {
    voiceId: `fixture-123456781234:${trackIndex}:${channelIndex}`,
    voiceIndex: trackIndex + 1,
    trackIndex,
    channelIndex,
    midiChannel: channelIndex + 1,
    safeVoiceLabel: `MIDI Channel ${channelIndex + 1}`,
    dominantProgram: null,
    gmProgramName: null,
    programNumbers: [],
    hasProgramChanges: false,
    isDrum: channelIndex === 9,
    noteCount: 4,
    pitchRange: { min: 48, max: 60 },
    averageDurationBeats: 1,
    averagePolyphony: 1,
    currentAutomaticRole,
    currentAutomaticRoleConfidence: 0.4,
    evidence: [{ kind: "measured" as const, role: currentAutomaticRole, confidence: 0.4 }],
    suggestedExpectedRole: currentAutomaticRole,
    expectedRole: null,
    humanReviewNote: "",
  };
}

describe("P5.21 supplied synthetic fixture import", () => {
  it("maps only anonymous track/channel positions and rejects malformed keys", () => {
    expect(parseSuppliedVoiceKey("voice:1/ch:9")).toBe("1:9");
    expect(() => parseSuppliedVoiceKey("private-song")).toThrow(/anonymous/);
    expect(() => parseSuppliedVoiceKey("voice:0/ch:16")).toThrow(/bounds/);
  });

  it("uses fixture-defined truth rather than the product prediction", () => {
    const applied = applyFixtureDefinedExpectedRoles(template(), [
      { voiceKey: "voice:0/ch:0", expectedRole: "melody" },
      { voiceKey: "voice:1/ch:9", expectedRole: "ambiguous" },
    ]);
    expect(applied.voices[0].currentAutomaticRole).toBe("mixed");
    expect(applied.voices[0].expectedRole).toBe("melody");
    expect(applied.voices[1].expectedRole).toBe("ambiguous");
  });

  it("fails closed when supplied ground truth is duplicate or incomplete", () => {
    expect(() => applyFixtureDefinedExpectedRoles(template(), [
      { voiceKey: "voice:0/ch:0", expectedRole: "melody" },
      { voiceKey: "track:0/channel:0", expectedRole: "bass" },
    ])).toThrow(/repeats/);
    expect(() => applyFixtureDefinedExpectedRoles(template(), [
      { voiceKey: "voice:0/ch:0", expectedRole: "melody" },
    ])).toThrow(/count/);
  });

  it("calculates the locked current-v1 metrics while excluding ambiguous truth", () => {
    const registry: ApprovedFixtureRegistry = {
      schemaVersion: 1,
      kind: "p521-approved-synthetic-role-fixture-registry",
      provenance: {
        fixturePack: "p5.21-supplied-synthetic",
        expectedRoles: "fixture-defined-ground-truth",
        currentPredictionIsNotTruth: true,
        sourcePathsIncluded: false,
        rawMidiIncluded: false,
      },
      fixtures: [applyFixtureDefinedExpectedRoles(template(), [
        { voiceKey: "voice:0/ch:0", expectedRole: "melody" },
        { voiceKey: "voice:1/ch:9", expectedRole: "ambiguous" },
      ])],
    };
    const metrics = calculateRoleBaseline(registry);
    expect(metrics).toMatchObject({
      totalVoices: 2,
      evaluatedVoices: 1,
      ambiguousVoices: 1,
      exactRoleAccuracy: 0,
      manualCorrectionCount: 1,
      manualCorrectionBurden: 1,
      mixedPredictionRate: 1,
      melodyRecall: 0,
    });
    expect(metrics.percussionPrecision).toBeNull();
  });
});
