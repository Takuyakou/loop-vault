import { describe, expect, it } from "vitest";
import type { PreAnalysisSourceScan } from "../../src/domain/midi/preAnalysis/types";
import {
  createAnonymousFixtureId,
  createGroundTruthTemplate,
  expectedRoleOptions,
} from "./roleGroundTruthTemplate";

const scan: PreAnalysisSourceScan = {
  source: {
    id: "ignored-source",
    displayName: "untrusted source title",
    smfType: 1,
    ppq: 480,
    durationBeats: 16,
    tempoMap: [{ beat: 0, bpm: 120 }],
    timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
  },
  notes: [],
  controlChanges: [],
  voices: [{
    id: "ignored-source:0:0",
    sourceId: "ignored-source",
    trackIndex: 0,
    channel: 0,
    programNumbers: [33],
    dominantProgram: 33,
    gmProgramName: "Electric Bass",
    trackName: "untrusted track label",
    displayName: "untrusted track label",
    hasProgramChanges: false,
    isDrum: false,
    noteCount: 24,
    minPitch: 36,
    maxPitch: 55,
    averageDurationBeats: 1.25,
    averagePolyphony: 1,
    autoRole: "bass",
    autoRoleConfidence: 0.99,
    assignedRole: "bass",
    included: true,
    visible: true,
    muted: false,
    solo: false,
  }],
};

describe("P5.21 role ground-truth template", () => {
  it("creates an anonymous fixture id without deriving it from source bytes or labels", () => {
    expect(createAnonymousFixtureId(() => "12345678-1234-5678-9012-123456789012"))
      .toBe("fixture-123456781234");
  });

  it("keeps classifier output as diagnostic evidence and omits private source metadata", () => {
    const template = createGroundTruthTemplate(
      scan,
      "fixture-123456781234",
      new Map([["0:0", "bass" as const]]),
    );
    const serialized = JSON.stringify(template);

    expect(template.expectedRoleOptions).toEqual(expectedRoleOptions);
    expect(template.voices[0]).toMatchObject({
      voiceId: "fixture-123456781234:0:0",
      voiceIndex: 1,
      trackIndex: 0,
      channelIndex: 0,
      midiChannel: 1,
      safeVoiceLabel: "GM 33 (Electric Bass) / MIDI Channel 1",
      noteCount: 24,
      pitchRange: { min: 36, max: 55 },
      currentAutomaticRole: "bass",
      expectedRole: null,
    });
    expect(serialized).not.toContain("untrusted track label");
    expect(serialized).not.toContain("untrusted source title");
    expect(serialized).not.toContain("autoRoleConfidence");
  });

  it("uses the full product role instead of the coarse pre-analysis role", () => {
    const template = createGroundTruthTemplate(
      {
        ...scan,
        voices: [{ ...scan.voices[0], autoRole: "harmony" }],
      },
      "fixture-123456781234",
      new Map([["0:0", "pad" as const]]),
    );

    expect(template.voices[0].currentAutomaticRole).toBe("pad");
    expect(template.voices[0].expectedRole).toBeNull();
  });

  it("rejects missing roles and fixture IDs that could carry user titles", () => {
    expect(() => createGroundTruthTemplate(scan, "fixture-123456781234", new Map()))
      .toThrow(/missing product automatic role/);
    expect(() => createGroundTruthTemplate(scan, "my-private-song", new Map()))
      .toThrow(/fixture id/);
  });
});