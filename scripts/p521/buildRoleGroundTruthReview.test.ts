import { describe, expect, it } from "vitest";
import {
  parseCliOptions,
  renderReviewHtml,
  resolveIgnoredOutputDirectory,
} from "./buildRoleGroundTruthReview";
const registry = {
  schemaVersion: 1 as const,
  kind: "p521-role-ground-truth-review-registry" as const,
  expectedRoleOptions: ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"],
  discovery: {
    worktreesConsidered: 1,
    manifestFilesExamined: 2,
    validManifests: 2,
    uniqueMidiCandidates: 1,
    scannedFixtures: 1,
    skippedUnreadableMidi: 0,
    cleanManifestGenerated: true,
    dirtyManifestGenerated: true,
  },
  fixtures: [{
    schemaVersion: 1 as const,
    kind: "p521-role-ground-truth-template" as const,
    fixture: { id: "fixture-123456781234", sourceIdentity: "local-midi-not-recorded" as const },
    expectedRoleOptions: ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"] as const,
    reviewPolicy: ["human review required"],
    voices: [{
      voiceId: "fixture-123456781234:0:0",
      voiceIndex: 1,
      trackIndex: 0,
      channelIndex: 0,
      midiChannel: 1,
      safeVoiceLabel: "GM 33 (Electric Bass) / MIDI Channel 1",
      dominantProgram: 33,
      gmProgramName: "Electric Bass",
      programNumbers: [33],
      hasProgramChanges: false,
      isDrum: false,
      noteCount: 24,
      pitchRange: { min: 36, max: 55 },
      averageDurationBeats: 1.25,
      averagePolyphony: 1,
      currentAutomaticRole: "bass" as const,
      currentAutomaticRoleConfidence: 0.99,
      evidence: [{ kind: "program" as const, role: "bass" as const, confidence: 0.9 }],
      suggestedExpectedRole: "bass" as const,
      expectedRole: null,
      humanReviewNote: "",
    }],
  }],
};

describe("P5.21 role ground-truth review", () => {
  it("uses no hand-written input and only accepts an ignored output override", () => {
    expect(parseCliOptions([])).toEqual({});
    expect(parseCliOptions(["--out", ".local-evaluation/p521-test"])).toEqual({
      outputDirectory: ".local-evaluation/p521-test",
    });
    expect(() => resolveIgnoredOutputDirectory("outside")).toThrow(/must remain inside/);
  });

  it("renders suggestions as unconfirmed and excludes source paths and titles", () => {
    const html = renderReviewHtml(registry);

    expect(html).toContain("Review required: suggested:");
    expect(html).toContain("suggestedExpectedRole");
    expect(html).toContain("Accept remaining suggestions after review");
    expect(html).toContain("currentAutomaticRole");
    expect(html).toContain("expectedRole");
    expect(html).not.toContain("C:\\");
    expect(html).not.toContain("untrusted source title");
  });
});