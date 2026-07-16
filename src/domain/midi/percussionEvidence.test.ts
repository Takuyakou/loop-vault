import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";
import { analyzeMidiHybrid, hybridAnalyzerVersion } from "./hybrid";
import {
  analyzeMidi as analyzeMidiLegacy,
  analyzerVersion as legacyAnalyzerVersion,
} from "./legacy";
import {
  analyzeMidiLegacyBoundaryRerank,
  legacyBoundaryRerankerVersion,
} from "./legacyBoundaryReranker";
import {
  analyzeMidiVoiceAwareRerank,
  voiceAwareRerankerVersion,
} from "./voiceAwareReranker";

describe("production analyzer percussion exclusion", () => {
  it("produces identical chord evidence with or without a channel 9 note", () => {
    const harmonyOnly = chordMidi(false);
    const withPercussion = chordMidi(true);
    const analyzers = [
      analyzeMidiLegacy,
      analyzeMidiHybrid,
      analyzeMidiLegacyBoundaryRerank,
      analyzeMidiVoiceAwareRerank,
    ];

    for (const analyze of analyzers) {
      expect(analyze(withPercussion)).toEqual(analyze(harmonyOnly));
    }
  });

  it("returns no invented harmony for percussion-only MIDI in every mode", () => {
    const percussionOnly = percussionMidi();
    const options = {
      fileName: "drums.mid",
      sourceAssetId: "percussion-source",
    };

    for (const { analyze, analyzerVersion } of [
      { analyze: analyzeMidiLegacy, analyzerVersion: legacyAnalyzerVersion },
      { analyze: analyzeMidiHybrid, analyzerVersion: hybridAnalyzerVersion },
      {
        analyze: analyzeMidiLegacyBoundaryRerank,
        analyzerVersion: legacyBoundaryRerankerVersion,
      },
      {
        analyze: analyzeMidiVoiceAwareRerank,
        analyzerVersion: voiceAwareRerankerVersion,
      },
    ]) {
      const result = analyze(percussionOnly, options);
      expect(result).toMatchObject({
        fileName: options.fileName,
        sourceAssetId: options.sourceAssetId,
        analyzerVersion,
        fullTimeline: [],
        blockCandidates: [],
      });
      expect(result.detectedKey).toBeUndefined();
    }
  });
});

function chordMidi(includePercussion: boolean): Uint8Array {
  const events: MidiEvent[] = [
    noteOn(0, 60),
    noteOn(0, 64),
    noteOn(0, 67),
    ...(includePercussion ? [noteOn(9, 66)] : []),
    noteOff(0, 60, 1920),
    noteOff(0, 64),
    noteOff(0, 67),
    ...(includePercussion ? [noteOff(9, 66)] : []),
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [events],
  }));
}

function percussionMidi(): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[
      noteOn(9, 36),
      noteOff(9, 36, 480),
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ]],
  }));
}

function noteOn(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity: 127 };
}

function noteOff(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}
