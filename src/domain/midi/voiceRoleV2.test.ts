import { describe, expect, it } from "vitest";
import type { NormalizedTimedNote, Voice } from "./types";
import { extractVoiceFeatures } from "./voiceRoles";
import {
  annotateVoiceRolesV2,
  inferVoiceRoleV2,
  resolveVoiceRoleV2,
  sanitizeVoiceRoleOverrides,
} from "./voiceRoleV2";
import { inferRoleV2Shadow } from "./voiceRoleV2ShadowClassifier";
import { extractRoleV2ShadowFeatures } from "./voiceRoleV2ShadowFeatures";

describe("Role v2 production promotion", () => {
  it("uses the exact locked Stage 02 classifier output for production annotations", () => {
    const voice = makeVoice({
      trackName: "Lead",
      medianPitch: 78,
      highestVoiceShare: 1,
    });
    const notes = [note(76, 0, 1), note(78, 1, 2), note(79, 2, 3)];
    const features = extractRoleV2ShadowFeatures([voice], notes).get(voice.id)!;
    const shadow = inferRoleV2Shadow(features);
    const annotated = annotateVoiceRolesV2([voice], notes)[0];

    expect(annotated).toMatchObject({
      inferredRole: shadow.role,
      roleConfidenceBucket: shadow.confidenceBucket,
      roleEvidenceKinds: shadow.evidenceKinds,
      roleInferenceVersion: "p521-role-v2-v1",
    });
    expect(voice).not.toHaveProperty("roleConfidenceBucket");
  });

  it("keeps Channel 10 percussion across override sanitization and resolution", () => {
    const drums = makeVoice({ id: "0:9", channel: 9, inferredRole: "percussion" });
    const notes = [note(36, 0, 0.25, 9)];
    const input = extractVoiceFeatures(drums, notes);
    const features = extractRoleV2ShadowFeatures([drums], notes).get(drums.id)!;

    expect(sanitizeVoiceRoleOverrides([drums], { [drums.id]: "harmony" })).toEqual({});
    expect(resolveVoiceRoleV2(input, features, "harmony")).toMatchObject({
      role: "percussion",
      confidenceBucket: "high",
      evidenceKinds: ["channel-10"],
    });
  });

  it("keeps non-drum manual overrides authoritative", () => {
    const voice = makeVoice();
    const notes = [note(60, 0, 1), note(64, 0, 1)];
    const input = extractVoiceFeatures(voice, notes);
    const features = extractRoleV2ShadowFeatures([voice], notes).get(voice.id)!;

    expect(inferVoiceRoleV2(input, features).role).not.toBe("bass");
    expect(resolveVoiceRoleV2(input, features, "bass")).toMatchObject({
      role: "bass",
      confidence: 1,
      confidenceBucket: "high",
      evidenceKinds: expect.arrayContaining(["manual-override"]),
    });
  });
});

function makeVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "0:0",
    trackIndex: 0,
    channel: 0,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 3,
    pitchRange: [60, 79],
    medianPitch: 69,
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
  channel = 0,
): NormalizedTimedNote {
  return {
    pitch,
    startTick: startBeat * 480,
    durationTick: (endBeat - startBeat) * 480,
    velocity: 0.8,
    trackIndex: 0,
    channel,
    sourceTrackIndex: 0,
    isDrum: channel === 9,
    startBeat,
    endBeat,
    sustainedEndBeat: endBeat,
  };
}
