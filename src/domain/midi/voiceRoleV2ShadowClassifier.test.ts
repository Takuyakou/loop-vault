import { describe, expect, it } from "vitest";
import type { RoleV2ShadowFeatures } from "./voiceRoleV2ShadowFeatures";
import { inferRoleV2Shadow } from "./voiceRoleV2ShadowClassifier";

describe("Role v2 shadow classifier", () => {
  it("keeps MIDI Channel 10 as the only hard percussion signal", () => {
    const result = inferRoleV2Shadow(feature({ percussionEvidence: percussion({ channel10: true }) }));

    expect(result).toEqual({
      role: "percussion",
      confidenceBucket: "high",
      evidenceKinds: ["channel-10"],
    });
  });

  it("does not let an off-channel GM112-119 program alone force percussion", () => {
    const result = inferRoleV2Shadow(feature({
      pitchCenterRank: 1,
      timeWeightedMonophony: 1,
      stepwiseMotionRatio: 1,
      programEvidence: { kind: "explicit-dominant-program", program: 112, role: "percussion", confidence: 0.96 },
      percussionEvidence: percussion({ gmPercussionProgram: true }),
    }));

    expect(result.role).toBe("melody");
    expect(result.evidenceKinds).not.toContain("percussion-soft-signature");
  });

  it("does not let an off-channel percussion name alone force percussion", () => {
    const result = inferRoleV2Shadow(feature({
      pitchCenterRank: 1,
      timeWeightedMonophony: 1,
      stepwiseMotionRatio: 1,
      trackNameEvidence: [{ kind: "track-name-hint", role: "percussion", hint: "percussion" }],
      percussionEvidence: percussion({ trackNameHint: true }),
    }));

    expect(result.role).toBe("melody");
  });

  it("does not let a program-only nonpercussion hint cross the role threshold", () => {
    const result = inferRoleV2Shadow(neutralFeature({
      programEvidence: { kind: "explicit-dominant-program", program: 33, role: "bass", confidence: 0.95 },
    }));

    expect(result).toMatchObject({ role: "mixed", confidenceBucket: "low" });
  });

  it("does not let a name-only nonpercussion hint cross the role threshold", () => {
    const result = inferRoleV2Shadow(neutralFeature({
      trackNameEvidence: [{ kind: "track-name-hint", role: "melody", hint: "melody" }],
    }));

    expect(result).toMatchObject({ role: "mixed", confidenceBucket: "low" });
  });
  it("fuses fixed aggregate evidence for low monophonic bass and sustained polyphonic harmony", () => {
    expect(inferRoleV2Shadow(feature({ pitchCenterRank: 0, timeWeightedMonophony: 1 })).role).toBe("bass");
    expect(inferRoleV2Shadow(feature({
      timeWeightedMonophony: 0,
      timeWeightedPolyphony: 2,
      robustDurationBeats: 2,
      trackNameEvidence: [{ kind: "track-name-hint", role: "harmony", hint: "harmony" }],
    })).role).toBe("harmony");
  });

  it("uses fixed high, medium, and low confidence bucket boundaries", () => {
    expect(inferRoleV2Shadow(feature({
      pitchCenterRank: 0,
      programEvidence: { kind: "explicit-dominant-program", program: 33, role: "bass", confidence: 0.95 },
    }))).toMatchObject({ role: "bass", confidenceBucket: "high" });
    expect(inferRoleV2Shadow(feature({ pitchCenterRank: 0 }))).toMatchObject({
      role: "bass",
      confidenceBucket: "medium",
    });
    expect(inferRoleV2Shadow(feature({
      programEvidence: { kind: "explicit-dominant-program", program: 33, role: "bass", confidence: 0.95 },
      trackNameEvidence: [{ kind: "track-name-hint", role: "melody", hint: "melody" }],
    }))).toMatchObject({ role: "mixed", confidenceBucket: "low" });
  });

  it("is deterministic and produces only ordered privacy-safe evidence kinds", () => {
    const input = feature({
      trackNameEvidence: [
        { kind: "track-name-hint", role: "melody", hint: "melody" },
        { kind: "track-name-hint", role: "melody", hint: "melody" },
      ],
      pitchCenterRank: 0.8,
      stepwiseMotionRatio: 0.8,
    });

    const first = inferRoleV2Shadow(input);
    expect(inferRoleV2Shadow(structuredClone(input))).toEqual(first);
    expect(first.evidenceKinds).toEqual([...first.evidenceKinds].sort((left, right) => left.localeCompare(right)));
    expect(new Set(first.evidenceKinds).size).toBe(first.evidenceKinds.length);
  });
});

function feature(overrides: Partial<RoleV2ShadowFeatures> = {}): RoleV2ShadowFeatures {
  return {
    voiceId: "0:0",
    sourceNoteCount: 4,
    proxyNoteCount: 4,
    legatoGapBeats: 0.25,
    activeDurationBeats: 4,
    monophonicActiveDurationBeats: 4,
    timeWeightedMonophony: 1,
    timeWeightedPolyphony: 1,
    robustDurationBeats: 1,
    pitchCenter: 60,
    pitchCenterRank: 0.5,
    pitchRange: 12,
    stepwiseMotionRatio: 0.25,
    noteDensityPerActiveBeat: 1,
    trackNameEvidence: [],
    percussionEvidence: percussion(),
    ...overrides,
  };
}

function neutralFeature(overrides: Partial<RoleV2ShadowFeatures> = {}): RoleV2ShadowFeatures {
  return feature({
    timeWeightedMonophony: 0,
    timeWeightedPolyphony: 1,
    robustDurationBeats: 0,
    pitchCenterRank: 0.5,
    stepwiseMotionRatio: 0,
    ...overrides,
  });
}
function percussion(overrides: Partial<RoleV2ShadowFeatures["percussionEvidence"]> = {}) {
  return {
    channel10: false,
    gmPercussionProgram: false,
    trackNameHint: false,
    softSignature: {
      robustDurationBeats: 1,
      noteDensityPerActiveBeat: 1,
      pitchRange: 12,
    },
    ...overrides,
  };
}