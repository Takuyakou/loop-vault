import { describe, expect, it } from "vitest";
import type { ChordSymbol, VoicingSnapshot } from "../types";
import {
  extractVoicing,
  normalizedChordKey,
  resolveVoicingForUse,
  voicingCompatibility,
} from "./index";

const cMajor: ChordSymbol = {
  root: 0,
  quality: "maj",
  tensions: [],
  label: "C",
};

function snapshot(overrides: Partial<VoicingSnapshot> = {}): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: "midi-extracted",
    representation: "simultaneous-voicing",
    midiNotes: [48, 55, 60, 64],
    bassNote: 48,
    capturedForChordKey: normalizedChordKey(cMajor),
    confidence: 0.9,
    ...overrides,
  };
}

describe("voicing memory", () => {
  it("normalizes chord semantics without using the display label", () => {
    expect(normalizedChordKey({ ...cMajor, label: "C major" })).toBe(normalizedChordKey(cMajor));
    expect(normalizedChordKey({ ...cMajor, quality: "six", label: "C6" }))
      .not.toBe(normalizedChordKey({ ...cMajor, root: 9, quality: "min7", bass: 0, label: "Am7/C" }));
  });

  it("marks a snapshot stale after chord replacement and never deletes it", () => {
    const saved = snapshot();
    expect(voicingCompatibility(saved, cMajor)).toBe("compatible");
    expect(voicingCompatibility(saved, { ...cMajor, root: 2, label: "D" })).toBe("stale");
  });

  it("resolves practice, verified source, high-confidence source, then generated", () => {
    const source = snapshot();
    const practice = snapshot({ source: "live-played", midiNotes: [48, 60, 64, 67], userVerified: true });
    expect(resolveVoicingForUse(cMajor, {
      sourceVoicing: source,
      practiceVoicingOverride: practice,
    }, [48, 52, 55]).origin).toBe("practice-override");
    expect(resolveVoicingForUse(cMajor, {
      sourceVoicing: { ...source, userVerified: true },
    }, [48, 52, 55]).origin).toBe("source-verified");
    expect(resolveVoicingForUse(cMajor, { sourceVoicing: source }, [48, 52, 55]).origin)
      .toBe("source-auto");
    expect(resolveVoicingForUse(cMajor, {
      sourceVoicing: { ...source, representation: "aggregated-note-set" },
    }, [48, 52, 55]).origin).toBe("generated");
  });

  it("extracts the same simultaneous voicing deterministically and excludes drums", () => {
    const input = {
      chord: cMajor,
      segment: { startBeat: 0, endBeat: 4 },
      ticksPerBeat: 480,
      notes: [
        { pitch: 48, startTick: 0, durationTick: 960, velocity: 90, trackIndex: 0, channel: 0 },
        { pitch: 60, startTick: 0, durationTick: 960, velocity: 90, trackIndex: 0, channel: 0 },
        { pitch: 64, startTick: 0, durationTick: 960, velocity: 90, trackIndex: 0, channel: 0 },
        { pitch: 67, startTick: 0, durationTick: 960, velocity: 90, trackIndex: 0, channel: 0 },
        { pitch: 36, startTick: 0, durationTick: 960, velocity: 127, trackIndex: 1, channel: 9 },
      ],
    };
    const first = extractVoicing(input);
    expect(first).toEqual(extractVoicing(input));
    expect(first.snapshot?.representation).toBe("simultaneous-voicing");
    expect(first.snapshot?.midiNotes).toEqual([48, 60, 64, 67]);
  });

  it("uses an explicitly review-only aggregated note set for an arpeggio", () => {
    const result = extractVoicing({
      chord: cMajor,
      segment: { startBeat: 0, endBeat: 4 },
      ticksPerBeat: 480,
      notes: [48, 60, 64, 67].map((pitch, index) => ({
        pitch,
        startTick: index * 480,
        durationTick: 240,
        velocity: 90,
        trackIndex: 0,
        channel: 0,
      })),
    });
    expect(result.snapshot?.representation).toBe("aggregated-note-set");
    expect(result.status).toBe("review");
  });
});
