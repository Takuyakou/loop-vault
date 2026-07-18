import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";
import { analyzeMidi, defaultAnalyzerMode } from "./analysis";
import { analyzeMidi as analyzeMidiLegacy } from "./legacy";
import type { VoiceEvidenceProfiles } from "./types";
import {
  analyzeMidiVoiceAwareRerank,
  scoreVoiceAwareChordCandidates,
  voiceAwareRerankerVersion,
} from "./voiceAwareReranker";

describe("voice-aware legacy-boundary reranker", () => {
  it("is opt-in and dispatches through the public analyzer mode", () => {
    const bytes = mixedVoiceMidi();

    expect(defaultAnalyzerMode).toBe("legacy");
    expect(analyzeMidi(bytes).analyzerVersion).not.toBe(voiceAwareRerankerVersion);
    expect(analyzeMidi(bytes, { mode: "voice-aware-rerank-v1" }).analyzerVersion)
      .toBe(voiceAwareRerankerVersion);
  });

  it("preserves every legacy timeline position and keeps the legacy chord available", () => {
    const bytes = mixedVoiceMidi();
    const legacy = analyzeMidiLegacy(bytes);
    const voiceAware = analyzeMidiVoiceAwareRerank(bytes);

    expect(voiceAware.fullTimeline.map(position)).toEqual(legacy.fullTimeline.map(position));
    voiceAware.fullTimeline.forEach((item, index) => {
      const legacyLabel = legacy.fullTimeline[index].chord.label;
      expect(
        item.chord.label === legacyLabel
          || item.alternatives.some((alternative) => alternative.chord.label === legacyLabel),
      ).toBe(true);
      expect(item.alternatives.length).toBeLessThanOrEqual(5);
    });
  });

  it("preserves denominator-aware legacy positions in 6/8", () => {
    const bytes = sixEightMidi();
    const legacy = analyzeMidiLegacy(bytes);
    const voiceAware = analyzeMidiVoiceAwareRerank(bytes);

    expect(voiceAware.timeSignature).toBe("6/8");
    expect(voiceAware.fullTimeline.map(position)).toEqual(legacy.fullTimeline.map(position));
  });

  it("returns deep-equal output for identical bytes and options", () => {
    const bytes = mixedVoiceMidi();
    const options = { mode: "voice-aware-rerank-v1" as const, fileName: "mixed.mid" };

    expect(analyzeMidi(bytes, options)).toEqual(analyzeMidi(bytes, options));
  });

  it("accepts session-only Voice selection and role overrides", () => {
    const bytes = mixedVoiceMidi();
    const baseline = analyzeMidiVoiceAwareRerank(bytes);
    const selected = analyzeMidiVoiceAwareRerank(bytes, {}, {
      analysisInput: {
        voices: [],
        enabledVoiceIds: ["0:0", "0:1"],
        roleOverrides: { "0:0": "bass", "0:1": "harmony" },
      },
    });

    expect(selected.fullTimeline.map(position)).toEqual(baseline.fullTimeline.map(position));
    expect(selected.analyzerVersion).toBe(voiceAwareRerankerVersion);
  });

  it("keeps percussion-only input empty", () => {
    const result = analyzeMidiVoiceAwareRerank(percussionOnlyMidi());

    expect(result.fullTimeline).toEqual([]);
    expect(result.blockCandidates).toEqual([]);
  });

  it("does not invent a bass hypothesis or bonus when bass evidence is empty", () => {
    const profile = evidence({ quality: [[0, 3], [4, 2], [7, 2]], root: [[0, 2]] });
    const candidates = scoreVoiceAwareChordCandidates(profile);

    expect(candidates).toHaveLength(8);
    expect(candidates.every((candidate) => candidate.chord.bass === undefined)).toBe(true);
    expect(candidates.every((candidate) => candidate.bassCompatibilityScore === 0)).toBe(true);
    expect(candidates.every((candidate) => candidate.slashCompatibilityScore === 0)).toBe(true);
    expect(candidates.every((candidate) => candidate.evidence.every((item) => item.kind !== "bass")))
      .toBe(true);
  });
});

function position(item: { bar: number; beat: number; durationBeats: number }) {
  return { bar: item.bar, beat: item.beat, durationBeats: item.durationBeats };
}

function mixedVoiceMidi(): Uint8Array {
  return smf([[
    programChange(0, 32),
    programChange(1, 0),
    programChange(2, 80),
    noteOn(0, 36),
    noteOn(1, 60),
    noteOn(1, 64),
    noteOn(1, 67),
    noteOn(2, 76),
    noteOn(9, 42),
    noteOff(0, 36, 1920),
    noteOff(1, 60),
    noteOff(1, 64),
    noteOff(1, 67),
    noteOff(2, 76),
    noteOff(9, 42),
    endOfTrack(),
  ]]);
}

function percussionOnlyMidi(): Uint8Array {
  return smf([[
    noteOn(9, 36),
    noteOff(9, 36, 480),
    endOfTrack(),
  ]]);
}

function sixEightMidi(): Uint8Array {
  return smf([[
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: 6,
      denominator: 8,
      metronome: 24,
      thirtyseconds: 8,
    },
    noteOn(0, 48),
    noteOn(0, 60),
    noteOn(0, 64),
    noteOn(0, 67),
    noteOff(0, 48, 1440),
    noteOff(0, 60),
    noteOff(0, 64),
    noteOff(0, 67),
    endOfTrack(),
  ]]);
}

function evidence(values: {
  root?: Array<[number, number]>;
  bass?: Array<[number, number]>;
  quality?: Array<[number, number]>;
  tension?: Array<[number, number]>;
}): VoiceEvidenceProfiles {
  const result: VoiceEvidenceProfiles = {
    rootEvidence: zeros(),
    bassEvidence: zeros(),
    qualityEvidence: zeros(),
    tensionEvidence: zeros(),
  };
  for (const [index, value] of values.root ?? []) result.rootEvidence[index] = value;
  for (const [index, value] of values.bass ?? []) result.bassEvidence[index] = value;
  for (const [index, value] of values.quality ?? []) result.qualityEvidence[index] = value;
  for (const [index, value] of values.tension ?? []) result.tensionEvidence[index] = value;
  return result;
}

function zeros(): number[] {
  return Array(12).fill(0) as number[];
}

function smf(tracks: MidiEvent[][]): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format: tracks.length === 1 ? 0 : 1, numTracks: tracks.length, ticksPerBeat: 480 },
    tracks,
  }));
}

function programChange(channel: number, programNumber: number): MidiEvent {
  return { deltaTime: 0, type: "programChange", channel, programNumber };
}

function noteOn(channel: number, noteNumber: number): MidiEvent {
  return { deltaTime: 0, type: "noteOn", channel, noteNumber, velocity: 100 };
}

function noteOff(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}

function endOfTrack(): MidiEvent {
  return { deltaTime: 0, meta: true, type: "endOfTrack" };
}
