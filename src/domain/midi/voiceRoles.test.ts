import { describe, expect, it } from "vitest";
import type { NormalizedTimedNote, Voice } from "./types";
import {
  annotateVoiceRoles,
  extractVoiceFeatures,
  inferVoiceRole,
  resolveVoiceRole,
  voiceRoleEvidence,
} from "./voiceRoles";

describe("Voice role inference", () => {
  it("computes stepwise, repeated-pitch-class, and sustain features deterministically", () => {
    const voice = makeVoice({ noteCount: 4 });
    const notes = [
      note(60, 0, 1, 1.5),
      note(62, 1, 2, 2),
      note(74, 2, 3, 3),
      note(62, 3, 4, 4.5),
    ];

    const first = extractVoiceFeatures(voice, notes);
    const second = extractVoiceFeatures(voice, notes);

    expect(first).toEqual(second);
    expect(first.avgDurationBeats).toBe(1.25);
    expect(first.stepwiseMotionRatio).toBeCloseTo(1 / 3);
    expect(first.repeatedPitchClassRatio).toBeCloseTo(2 / 3);
    expect(first.sustainRatio).toBeCloseTo(0.25);
  });

  it("combines explicit Program, track name, and measured evidence", () => {
    const voice = makeVoice({
      trackName: "Electric Bass",
      explicitPrograms: [{ program: 33, noteCount: 8, durationTicks: 3840 }],
      dominantProgram: 33,
      dominantProgramExplicit: true,
      medianPitch: 40,
      pitchRange: [35, 48],
      lowestVoiceShare: 0.9,
    });
    const input = extractVoiceFeatures(voice, [note(40, 0, 2, 2), note(43, 2, 4, 4)]);
    const evidence = voiceRoleEvidence(input);
    const inference = inferVoiceRole(input);

    expect(evidence.program).toEqual({ role: "bass", confidence: 0.95, explicit: true });
    expect(evidence.trackName).toEqual({ role: "bass", confidence: 0.9 });
    expect(inference.role).toBe("bass");
    expect(inference.reasons).toContain("program:bass");
    expect(inference.reasons).toContain("track-name:bass");
  });

  it("does not create strong piano evidence from implicit Program 0", () => {
    const voice = makeVoice({ dominantProgram: 0, dominantProgramExplicit: false });
    const input = extractVoiceFeatures(voice, [note(60, 0, 1, 1)]);

    expect(voiceRoleEvidence(input).program).toBeUndefined();
  });

  it("falls back to mixed when sparse evidence lacks score and margin", () => {
    const voice = makeVoice({
      noteCount: 1,
      pitchRange: [60, 60],
      medianPitch: 60,
      lowestVoiceShare: 1,
      highestVoiceShare: 1,
    });
    const input = extractVoiceFeatures(voice, [note(60, 0, 0.25, 0.25)]);

    const inference = inferVoiceRole(input);

    expect(inference.role).toBe("mixed");
    expect(inference.confidence).toBeLessThan(0.5);
    expect(inference.reasons).toContain("fallback:mixed-low-confidence");
  });

  it("does not let an explicit piano Program hard-precede stronger name and measured evidence", () => {
    const voice = makeVoice({
      trackName: "Lead Melody",
      explicitPrograms: [{ program: 0, noteCount: 3, durationTicks: 1440 }],
      dominantProgram: 0,
      dominantProgramExplicit: true,
      pitchRange: [72, 84],
      medianPitch: 76,
      noteDensity: 2,
      highestVoiceShare: 1,
    });
    const input = extractVoiceFeatures(voice, [
      note(72, 0, 1, 1),
      note(74, 1, 2, 2),
      note(76, 2, 3, 3),
    ]);

    expect(voiceRoleEvidence(input).program).toEqual({ role: "harmony", confidence: 0.65, explicit: true });
    expect(inferVoiceRole(input).role).toBe("melody");
  });

  it("applies role overrides after inference but never overrides channel 9 percussion", () => {
    const harmony = makeVoice({ trackName: "Keys" });
    const harmonyInput = extractVoiceFeatures(harmony, [note(60, 0, 1, 1)]);
    expect(resolveVoiceRole(harmonyInput, "melody")).toMatchObject({
      role: "melody",
      confidence: 1,
      reasons: ["override:melody", expect.any(String), expect.any(String)],
    });

    const drums = makeVoice({ id: "0:9", channel: 9, inferredRole: "percussion", roleConfidence: 1 });
    const drumInput = extractVoiceFeatures(drums, [note(36, 0, 0.25, 0.25, 9)]);
    expect(resolveVoiceRole(drumInput, "harmony")).toMatchObject({ role: "percussion", confidence: 1 });
  });

  it("allows overriding inferred percussion when the hard channel 9 rule does not apply", () => {
    const gmPercussion = makeVoice({
      explicitPrograms: [{ program: 112, noteCount: 4, durationTicks: 960 }],
      dominantProgram: 112,
      dominantProgramExplicit: true,
    });
    const gmInput = extractVoiceFeatures(gmPercussion, [note(60, 0, 1, 1)]);
    expect(inferVoiceRole(gmInput).role).toBe("percussion");
    expect(resolveVoiceRole(gmInput, "harmony")).toMatchObject({ role: "harmony", confidence: 1 });

    const namedPercussion = makeVoice({ trackName: "Percussion" });
    const namedInput = extractVoiceFeatures(namedPercussion, [note(60, 0, 1, 1)]);
    expect(inferVoiceRole(namedInput).role).toBe("percussion");
    expect(resolveVoiceRole(namedInput, "mixed")).toMatchObject({ role: "mixed", confidence: 1 });
  });

  it("returns annotated copies without mutating the source Voice", () => {
    const source = makeVoice({ trackName: "Lead", highestVoiceShare: 1, medianPitch: 76 });
    const input = extractVoiceFeatures(source, [note(76, 0, 1, 1), note(78, 1, 2, 2)]);
    const annotated = annotateVoiceRoles([source], new Map([[source.id, input]]));

    expect(annotated[0].inferredRole).toBe("melody");
    expect(source.inferredRole).toBe("mixed");
  });
});

function makeVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "0:0",
    trackIndex: 0,
    channel: 0,
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 2,
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
  sustainedEndBeat: number,
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
    sustainedEndBeat,
  };
}
