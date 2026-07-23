import { describe, expect, it } from "vitest";
import { voiceChordForPreview } from "../chordVoicing";
import { makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import {
  adaptGeneratedCloseVoicing,
  findLowIntervalViolation,
  generateStyleCandidates,
  generateStyleVoicingPlan,
  handSpan,
  handsDoNotCross,
  MAX_STYLE_CANDIDATES_PER_EVENT,
  styleVoicingTransitionCost,
} from ".";

const options = {
  maxLeftHandSpanSemitones: 12,
  maxRightHandSpanSemitones: 12,
  allowUnsupportedFallback: false,
};

describe("style voicing candidate generation", () => {
  it("keeps the existing close generator output byte-for-byte", () => {
    const event = chordEvent(makeChordSymbol(0, "maj9"), 0);
    expect(adaptGeneratedCloseVoicing(event, 0).allNotes).toEqual(
      [...voiceChordForPreview(event.chord).notes].sort((left, right) => left - right),
    );
  });

  it.each(["shell-17", "open-17", "rootless-ab"] as const)(
    "generates playable, bounded, deterministic %s candidates",
    (styleId) => {
      const chord = makeChordSymbol(0, "maj7");
      const first = generateStyleCandidates(chord, styleId, options);
      const second = generateStyleCandidates(chord, styleId, options);
      expect(first.length).toBeGreaterThan(0);
      expect(first.length).toBeLessThanOrEqual(MAX_STYLE_CANDIDATES_PER_EVENT);
      expect(second).toEqual(first);
      for (const candidate of first) {
        expect(handSpan(candidate.leftHandNotes)).toBeLessThanOrEqual(12);
        expect(handSpan(candidate.rightHandNotes)).toBeLessThanOrEqual(12);
        expect(handsDoNotCross(candidate.leftHandNotes, candidate.rightHandNotes)).toBe(true);
        expect(findLowIntervalViolation(candidate.allNotes)).toBeUndefined();
      }
    },
  );

  it("makes open candidates wider than shell candidates", () => {
    const chord = makeChordSymbol(0, "maj7");
    const shell = generateStyleCandidates(chord, "shell-17", options)[0];
    const open = generateStyleCandidates(chord, "open-17", options)[0];
    expect(width(open.allNotes)).toBeGreaterThan(width(shell.allNotes));
  });

  it("keeps the root out of rootless voicings and supplies A/B variants", () => {
    const candidates = generateStyleCandidates(
      makeChordSymbol(0, "dom7"),
      "rootless-ab",
      options,
    );
    expect(new Set(candidates.map((candidate) => candidate.variant))).toEqual(new Set(["A", "B"]));
    expect(candidates.every((candidate) => (
      candidate.allNotes.every((note) => note % 12 !== 0)
    ))).toBe(true);
    expect(candidates.some((candidate) => candidate.addedColorIntervals.includes("9"))).toBe(true);
  });
});

describe("progression optimization", () => {
  const progression = [
    chordEvent(makeChordSymbol(2, "min7"), 0),
    chordEvent(makeChordSymbol(7, "dom7"), 1),
    chordEvent(makeChordSymbol(0, "maj7"), 2),
  ];

  it("optimizes a complete deterministic plan across the progression", () => {
    const first = generateStyleVoicingPlan(progression, "rootless-ab", options);
    for (let run = 0; run < 100; run += 1) {
      expect(generateStyleVoicingPlan(progression, "rootless-ab", options)).toEqual(first);
    }
    expect(first.events).toHaveLength(3);
    expect(first.unsupportedEvents).toEqual([]);
    expect(first.events.every((event) => event.styleId === "rootless-ab")).toBe(true);
  });

  it("does not choose a transition more expensive than the first-candidate path", () => {
    const plan = generateStyleVoicingPlan(progression, "shell-17", options);
    const selectedCost = plan.events.slice(1).reduce((sum, event, index) => (
      sum + styleVoicingTransitionCost(
        asCandidate(plan.events[index]),
        asCandidate(event),
      )
    ), 0);
    const firstCandidates = progression.map((event) => (
      generateStyleCandidates(event.chord, "shell-17", options)[0]
    ));
    const firstCost = firstCandidates.slice(1).reduce((sum, event, index) => (
      sum + styleVoicingTransitionCost(firstCandidates[index], event)
    ), 0);
    expect(selectedCost).toBeLessThanOrEqual(firstCost);
  });

  it("blocks unsupported rootless chords unless fallback is explicit", () => {
    const unsupported = [
      chordEvent(makeChordSymbol(0, "maj"), 0),
      chordEvent(makeChordSymbol(7, "dom7"), 1),
    ];
    const strict = generateStyleVoicingPlan(unsupported, "rootless-ab", options);
    expect(strict.unsupportedEvents).toHaveLength(1);
    expect(strict.events).toHaveLength(1);

    const fallback = generateStyleVoicingPlan(unsupported, "rootless-ab", {
      ...options,
      allowUnsupportedFallback: true,
    });
    expect(fallback.events).toHaveLength(2);
    expect(fallback.events[0]).toEqual(expect.objectContaining({
      styleId: "generated-close",
      warnings: ["fallback-close"],
    }));
  });

  it("generates a deterministic 32-event plan within the Phase target", () => {
    const longProgression = Array.from({ length: 32 }, (_, index) => (
      chordEvent(
        makeChordSymbol([2, 7, 0, 9][index % 4], index % 4 === 1 ? "dom7" : "min7"),
        index,
      )
    ));
    const startedAt = performance.now();
    const plan = generateStyleVoicingPlan(longProgression, "shell-17", options);
    const elapsedMs = performance.now() - startedAt;
    expect(plan.events).toHaveLength(32);
    expect(elapsedMs).toBeLessThanOrEqual(100);
  });
});

function chordEvent(
  chord: ChordTimelineItem["chord"],
  index: number,
): ChordTimelineItem {
  return {
    eventId: `style-test-${index}`,
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function width(notes: readonly number[]): number {
  return Math.max(...notes) - Math.min(...notes);
}

function asCandidate(event: ReturnType<typeof generateStyleVoicingPlan>["events"][number]) {
  return event;
}
