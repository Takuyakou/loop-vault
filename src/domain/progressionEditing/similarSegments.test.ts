import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordSymbol } from "../types";
import {
  buildSimilarityContext,
  findSimilarSegments,
  LEGACY_SIMILARITY_VOICE_ID,
  SIMILAR_SEGMENT_REASON_CODES,
  SIMILAR_SEGMENT_THRESHOLD,
} from ".";
import type {
  EditableChordSlot,
  SimilarityContext,
  SimilaritySegmentContext,
} from "./types";

const cSix = makeChordSymbol(0, "six");
const gMajor = makeChordSymbol(7, "maj");
const dMinor = makeChordSymbol(2, "min");
const aMinor = makeChordSymbol(9, "min");

describe("findSimilarSegments", () => {
  it("builds explicit fallback profiles and deterministic legacy analysis context", () => {
    const source = slot("source", 1, 1, cSix, gMajor, 2);
    const target = slot("target", 2, 1, cSix);
    const context = buildSimilarityContext([target, source], { key: "C major" });

    expect(context.segments?.source).toMatchObject({
      weightedPcp: expect.arrayContaining([expect.any(Number)]),
      bassProfile: expect.arrayContaining([expect.any(Number)]),
      originalRoot: 0,
      family: "six",
      durationBeats: 2,
      metricPosition: 1,
      key: "C major",
      enabledVoiceIds: [LEGACY_SIMILARITY_VOICE_ID],
      roleProfiles: {
        [LEGACY_SIMILARITY_VOICE_ID]: {
          role: "mixed",
          confidence: 1,
          rootWeight: 1,
          qualityWeight: 1,
        },
      },
    });
    expect(context.segments?.source.weightedPcp).toHaveLength(12);
    expect(context.segments?.source.bassProfile).toHaveLength(12);
    expect(context.segments?.source.nextChord).toEqual(target.originalChord);
    expect(context.segments?.target.previousChord).toEqual(source.originalChord);
    expect(findSimilarSegments([source, target], source, context)[0]?.reasons)
      .toEqual(expect.arrayContaining([
        "key-context-match",
        "enabled-voices-match",
        "role-profiles-match",
      ]));
  });

  it("uses every context feature and sorts by similarity, then position and id", () => {
    const source = slot("source", 1, 1, cSix, gMajor, 2);
    const lower = slot("lower", 1, 3, cSix, cSix, 3);
    const later = slot("later", 3, 1, cSix);
    const earlierB = slot("b", 2, 1, cSix);
    const earlierA = slot("a", 2, 1, cSix);
    const exactContext = analysisContext(2);
    const context: SimilarityContext = {
      segments: {
        source: exactContext,
        lower: analysisContext(3),
        later: exactContext,
        b: exactContext,
        a: exactContext,
      },
    };
    const timeline = [later, source, earlierB, lower, earlierA];
    const before = JSON.stringify({ timeline, context });

    const result = findSimilarSegments(timeline, source, context);

    expect(result.map((candidate) => candidate.segmentId)).toEqual([
      "a",
      "b",
      "later",
      "lower",
    ]);
    expect(result[0]?.similarity).toBe(1);
    expect(result[3]?.similarity).toBeLessThan(1);
    expect(result[0]?.reasons).toEqual([
      "weighted-pcp-match",
      "bass-profile-match",
      "original-root-match",
      "chord-family-match",
      "duration-match",
      "metric-position-match",
      "key-context-match",
      "previous-chord-match",
      "next-chord-match",
      "enabled-voices-match",
      "role-profiles-match",
    ]);
    expect(JSON.stringify({ timeline, context })).toBe(before);
  });

  it("falls back to ChordSymbol without treating PCP as sufficient evidence", () => {
    const source = slot("source", 1, 1, cSix, gMajor);
    const matching = slot("matching", 2, 1, cSix);

    expect(findSimilarSegments([source, matching], source, {})).toEqual([
      expect.objectContaining({
        segmentId: "matching",
        similarity: expect.any(Number),
        reasons: expect.arrayContaining(["chord-symbol-fallback"]),
      }),
    ]);
  });

  it("rejects the fixed false-positive cases", () => {
    const cSixPcp = pcp(0, 4, 7, 9);
    const cMajorSevenPcp = pcp(0, 4, 7, 11);

    expect(pairCandidates(
      cSix,
      makeChordSymbol(9, "min7", [], 0),
      samePcpContext(cSixPcp),
    )).toEqual([]); // C6 vs Am7/C

    expect(pairCandidates(
      makeChordSymbol(0, "maj7"),
      makeChordSymbol(4, "min", [], 0),
      samePcpContext(cMajorSevenPcp),
    )).toEqual([]); // Cmaj7 vs Em/C

    expect(pairCandidates(
      cSix,
      makeChordSymbol(0, "six", [], 4),
      samePcpContext(cSixPcp),
    )).toEqual([]); // same PCP, different bass

    expect(pairCandidates(
      cSix,
      cSix,
      {
        source: {
          ...analysisContext(2),
          key: "C major",
          metricPosition: 1,
          previousChord: dMinor,
          nextChord: gMajor,
          enabledVoiceIds: ["bass", "harmony"],
          roleProfiles: {
            bass: { role: "bass", confidence: 0.9 },
            harmony: { role: "harmony", confidence: 0.8 },
          },
        },
        candidate: {
          ...analysisContext(2),
          key: "F# major",
          metricPosition: 4,
          previousChord: aMinor,
          nextChord: dMinor,
          enabledVoiceIds: ["lead"],
          roleProfiles: { lead: { role: "melody", confidence: 0.3 } },
        },
      },
    )).toEqual([]); // same chord, different context

    expect(pairCandidates(
      makeChordSymbol(0, "maj"),
      makeChordSymbol(0, "min"),
      samePcpContext(pcp(0, 4, 7)),
    )).toEqual([]); // same root, different quality
  });

  it("keeps the threshold and reason-code contract fixed", () => {
    expect(SIMILAR_SEGMENT_THRESHOLD).toBe(0.86);
    expect(SIMILAR_SEGMENT_REASON_CODES).toEqual({
      weightedPcp: "weighted-pcp-match",
      bassProfile: "bass-profile-match",
      originalRoot: "original-root-match",
      chordFamily: "chord-family-match",
      duration: "duration-match",
      metricPosition: "metric-position-match",
      keyContext: "key-context-match",
      previousChord: "previous-chord-match",
      nextChord: "next-chord-match",
      enabledVoices: "enabled-voices-match",
      roleProfiles: "role-profiles-match",
      chordSymbolFallback: "chord-symbol-fallback",
    });
  });

  it("uses ASCII ordering and locale-independent case normalization", () => {
    const source = slot("source", 1, 1, cSix, gMajor);
    const upper = slot("Z", 2, 1, cSix);
    const lower = slot("a", 2, 1, cSix);
    const context = buildSimilarityContext([source, lower, upper], { key: "I MAJOR" });
    const originalLocaleCompare = String.prototype.localeCompare;
    const originalLocaleLower = String.prototype.toLocaleLowerCase;
    Object.defineProperty(String.prototype, "localeCompare", {
      configurable: true,
      value: () => { throw new Error("localeCompare must not be used"); },
    });
    Object.defineProperty(String.prototype, "toLocaleLowerCase", {
      configurable: true,
      value: () => { throw new Error("toLocaleLowerCase must not be used"); },
    });
    try {
      expect(findSimilarSegments([lower, source, upper], source, context)
        .map((candidate) => candidate.segmentId)).toEqual(["Z", "a"]);
    } finally {
      Object.defineProperty(String.prototype, "localeCompare", {
        configurable: true,
        value: originalLocaleCompare,
      });
      Object.defineProperty(String.prototype, "toLocaleLowerCase", {
        configurable: true,
        value: originalLocaleLower,
      });
    }
  });
});

function pairCandidates(
  sourceChord: ChordSymbol,
  candidateChord: ChordSymbol,
  contexts: { source: SimilaritySegmentContext; candidate: SimilaritySegmentContext },
) {
  const source = slot("source", 1, 1, sourceChord, gMajor);
  const candidate = slot("candidate", 2, 1, candidateChord);
  return findSimilarSegments(
    [source, candidate],
    source,
    { segments: { source: contexts.source, candidate: contexts.candidate } },
  );
}

function samePcpContext(
  weightedPcp: readonly number[],
): { source: SimilaritySegmentContext; candidate: SimilaritySegmentContext } {
  return {
    source: { weightedPcp },
    candidate: { weightedPcp },
  };
}

function analysisContext(durationBeats: number): SimilaritySegmentContext {
  return {
    weightedPcp: pcp(0, 4, 7, 9),
    bassProfile: pcp(0),
    originalRoot: 0,
    family: "six",
    durationBeats,
    metricPosition: 1,
    key: "C major",
    previousChord: dMinor,
    nextChord: gMajor,
    enabledVoiceIds: ["bass", "harmony"],
    roleProfiles: {
      bass: { role: "bass", confidence: 0.9, rootWeight: 1.2 },
      harmony: { role: "harmony", confidence: 0.8, qualityWeight: 1 },
    },
  };
}

function slot(
  id: string,
  bar: number,
  beat: number,
  originalChord: ChordSymbol,
  currentChord = originalChord,
  durationBeats = 2,
): EditableChordSlot {
  return {
    id,
    position: { bar, beat, durationBeats },
    originalChord,
    currentChord,
    alternatives: [],
    warnings: [],
    edited: currentChord !== originalChord,
  };
}

function pcp(...pitchClasses: number[]): number[] {
  return Array.from({ length: 12 }, (_, pitchClass) => (
    pitchClasses.includes(pitchClass) ? 1 : 0
  ));
}
