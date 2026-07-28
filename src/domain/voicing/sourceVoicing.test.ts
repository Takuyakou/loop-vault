import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import type { MidiSongData, TimedNote, Voice } from "../midi/types";
import {
  attachSourceVoicing, attachSourceVoicings, hasSourceVoicing,
  sourceVoicingCacheKey, sourceVoicingExtractorVersion,
} from "./sourceVoicing";
import { resolveVoicingForUse } from "./resolveVoicing";

const ticksPerBeat = 480;

function note(pitch: number, startBeat: number, lengthBeats: number): TimedNote {
  return {
    pitch,
    startTick: startBeat * ticksPerBeat,
    durationTick: lengthBeats * ticksPerBeat,
    velocity: 0.8,
    trackIndex: 0,
    channel: 0,
  };
}

function item(label: string, bar: number, durationBeats = 4): ChordTimelineItem {
  return {
    bar,
    beat: 1,
    durationBeats,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

/** Dm7 voiced as D2 F3 A3 C4, the fixture voicing from the plan. */
const dm7Notes = [note(38, 0, 4), note(53, 0, 4), note(57, 0, 4), note(60, 0, 4)];

const songData: MidiSongData = {
  notes: dm7Notes,
  ticksPerBeat,
  totalBars: 1,
  timeSignature: "4/4",
  tracks: [{ index: 0, name: "piano" }],
  controlChanges: [],
};

const analysis = {
  totalBars: 1,
  timeSignature: "4/4",
  sourceFingerprint: "fixture",
  fullTimeline: [],
  blockCandidates: [],
  analyzedAt: "1970-01-01T00:00:00.000Z",
  analyzerVersion: "phase4-symbolic-v1",
} as unknown as MidiProgressionAnalysis;

const context = { analysis, sourceData: songData, sourceVoices: undefined };

describe("source voicing extraction", () => {
  it("takes the voicing from the original MIDI", () => {
    const enriched = attachSourceVoicing(item("Dm7", 1), context);
    expect(hasSourceVoicing(enriched)).toBe(true);
    expect(enriched.voicingMemory?.sourceVoicing?.midiNotes).toEqual([38, 53, 57, 60]);
  });

  it("leaves the event untouched without source data", () => {
    const bare = attachSourceVoicing(item("Dm7", 1), {
      analysis, sourceData: undefined, sourceVoices: undefined,
    });
    expect(hasSourceVoicing(bare)).toBe(false);
  });

  it("reports no source voicing when the range holds no notes", () => {
    const empty = attachSourceVoicing(item("Dm7", 9), context);
    expect(hasSourceVoicing(empty)).toBe(false);
  });

  it("removes a supported monophonic melody only when Accuracy First is enabled", () => {
    const harmonyNotes = [
      { ...note(60, 0, 4), trackIndex: 0, channel: 0 },
      { ...note(64, 0, 4), trackIndex: 0, channel: 0 },
      { ...note(67, 0, 4), trackIndex: 0, channel: 0 },
    ];
    const melody = { ...note(72, 0, 4), trackIndex: 1, channel: 1 };
    const voices = [
      voice("0:0", "harmony", 0.9, 3, 0.2, 0.2),
      voice("1:1", "melody", 0.9, 1, 1, 0),
    ];
    const sourceData = { ...songData, notes: [...harmonyNotes, melody] };
    const baseContext = { analysis, sourceData, sourceVoices: voices };
    const withoutFilter = attachSourceVoicing(item("C", 1), baseContext);
    const withFilter = attachSourceVoicing(item("C", 1), {
      ...baseContext,
      accuracyFirst: { melodyContaminationFilter: true },
    });
    expect(withoutFilter.voicingMemory?.sourceVoicing?.midiNotes).toContain(72);
    expect(withFilter.voicingMemory?.sourceVoicing?.midiNotes).toEqual([60, 64, 67]);
  });
});

function voice(
  id: string,
  inferredRole: Voice["inferredRole"],
  roleConfidence: number,
  maxPolyphony: number,
  highestVoiceShare: number,
  lowestVoiceShare: number,
): Voice {
  return {
    id,
    trackIndex: Number(id.split(":")[0]),
    channel: Number(id.split(":")[1]),
    explicitPrograms: [],
    dominantProgramExplicit: false,
    noteCount: 4,
    pitchRange: [48, 84],
    medianPitch: 64,
    avgDurationTick: ticksPerBeat * 4,
    noteDensity: 1,
    maxPolyphony,
    simultaneousOnsetRatio: maxPolyphony > 1 ? 1 : 0,
    highestVoiceShare,
    lowestVoiceShare,
    inferredRole,
    roleConfidence,
    roleEvidence: { measured: {
      bass: 0,
      harmony: inferredRole === "harmony" ? 1 : 0,
      pad: 0,
      melody: inferredRole === "melody" ? 1 : 0,
      percussion: 0,
      mixed: 0,
    } },
  };
}

describe("capture preview matches the saved progression", () => {
  it("resolves the same notes before and after saving", () => {
    // The capture preview path.
    const previewed = attachSourceVoicing(item("Dm7", 1), context);
    const preview = resolveVoicingForUse(
      previewed.chord,
      previewed.voicingMemory,
      [60, 64, 67],
    );

    // The save path re-uses the voicing already attached rather than redoing it.
    const saved = previewed.voicingMemory?.sourceVoicing
      ? previewed
      : attachSourceVoicing(previewed, context);
    const afterSave = resolveVoicingForUse(saved.chord, saved.voicingMemory, [60, 64, 67]);

    expect(preview.midiNotes).toEqual([38, 53, 57, 60]);
    expect(afterSave.midiNotes).toEqual(preview.midiNotes);
    expect(afterSave.origin).toBe(preview.origin);
  });

  it("falls back to the generated voicing rather than pretending to have one", () => {
    const withoutSource = item("Dm7", 9);
    const resolved = resolveVoicingForUse(withoutSource.chord, undefined, [62, 65, 69, 72]);
    expect(resolved.origin).toBe("generated");
    expect(resolved.midiNotes).toEqual([62, 65, 69, 72]);
  });
});

describe("cache key", () => {
  it("separates events by range and by chord", () => {
    const base = item("Dm7", 1);
    expect(sourceVoicingCacheKey(base, "fixture"))
      .not.toBe(sourceVoicingCacheKey(item("Dm7", 2), "fixture"));
    expect(sourceVoicingCacheKey(base, "fixture"))
      .not.toBe(sourceVoicingCacheKey(item("Dmaj7", 1), "fixture"));
    expect(sourceVoicingCacheKey(base, "fixture"))
      .not.toBe(sourceVoicingCacheKey(base, "other-file"));
  });

  it("carries the extractor version so a changed extractor invalidates entries", () => {
    expect(sourceVoicingCacheKey(item("Dm7", 1), "fixture"))
      .toContain(sourceVoicingExtractorVersion);
  });

  it("reuses a cached entry instead of extracting twice", () => {
    const cache = new Map();
    const first = attachSourceVoicing(item("Dm7", 1), context, cache);
    const second = attachSourceVoicing(item("Dm7", 1), context, cache);
    expect(cache.size).toBe(1);
    expect(second.voicingMemory?.sourceVoicing?.midiNotes)
      .toEqual(first.voicingMemory?.sourceVoicing?.midiNotes);
  });

  it("caches the absence of a voicing too", () => {
    const cache = new Map();
    attachSourceVoicing(item("Dm7", 9), context, cache);
    attachSourceVoicing(item("Dm7", 9), context, cache);
    expect(cache.size).toBe(1);
  });

  it("enriches a whole timeline", () => {
    const enriched = attachSourceVoicings([item("Dm7", 1), item("Dm7", 9)], context, new Map());
    expect(hasSourceVoicing(enriched[0])).toBe(true);
    expect(hasSourceVoicing(enriched[1])).toBe(false);
  });
});
