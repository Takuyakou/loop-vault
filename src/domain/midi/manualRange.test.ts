import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateEvents } from "./candidateBlock";
import { buildOccurrences } from "./occurrence";
import {
  clampTimelineRange,
  createCandidateFromTimelineRange,
  isManualRangeOccurrence,
  manualRangeId,
  timelineRangeBeats,
  timelineRangeIssues,
} from "./manualRange";

/**
 * Ranges a person chose.
 *
 * The cases here are the ones the M0 measurement found: a span no generator
 * proposed, a span whose edges are one bar off the nearest candidate, and a
 * span that starts partway through a bar.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function bars(startBar: number, roots: readonly number[]): ChordTimelineItem[] {
  return roots.map((root, index) => ({
    bar: startBar + index,
    beat: 1,
    durationBeats: 4,
    chord: chord(root),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

const timeline = bars(1, [0, 9, 5, 7, 2, 7, 4, 11, 3, 8, 1, 6]);

describe("timeline range bounds", () => {
  it("includes the beat the user named", () => {
    // "bar 1 beat 1 to bar 4 beat 4" is four whole bars, not fifteen beats.
    expect(timelineRangeBeats({ startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 }))
      .toEqual({ startBeat: 0, endBeat: 16 });
  });

  it("handles a range starting partway through a bar", () => {
    expect(timelineRangeBeats({ startBar: 2, startBeat: 3, endBar: 3, endBeat: 2 }))
      .toEqual({ startBeat: 6, endBeat: 10 });
  });
});

describe("range validation", () => {
  const range = { timeline, startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 };

  it("accepts a usable range", () => {
    expect(timelineRangeIssues(range)).toEqual([]);
  });

  it("rejects a backwards range", () => {
    expect(timelineRangeIssues({ ...range, startBar: 5, endBar: 2 })).toContain("end-before-start");
  });

  it("rejects a range with no width", () => {
    // Beat 2 to beat 1 of the same bar covers nothing: the end beat is inclusive,
    // so this asks for the half-open span [5, 5).
    expect(timelineRangeIssues({ ...range, startBar: 2, startBeat: 2, endBar: 2, endBeat: 1 }))
      .toContain("zero-length");
  });

  it("accepts a single beat", () => {
    expect(timelineRangeIssues({ ...range, startBar: 2, startBeat: 2, endBar: 2, endBeat: 2 }))
      .toEqual([]);
  });

  it("rejects a beat outside the bar", () => {
    expect(timelineRangeIssues({ ...range, startBeat: 9 })).toContain("beat-out-of-bar");
  });

  it("rejects an empty timeline", () => {
    expect(timelineRangeIssues({ ...range, timeline: [] })).toContain("empty-timeline");
  });

  it("rejects a range past the last chord", () => {
    expect(timelineRangeIssues({ ...range, startBar: 40, endBar: 44 }))
      .toContain("no-chords-in-range");
  });
});

describe("clamping a drag", () => {
  it("pulls a range that runs off the end back to the last bar", () => {
    expect(clampTimelineRange({ startBar: 10, startBeat: 1, endBar: 99, endBeat: 4 }, 12))
      .toEqual({ startBar: 10, startBeat: 1, endBar: 12, endBeat: 4 });
  });

  it("reads a backwards drag as the range between the two points", () => {
    expect(clampTimelineRange({ startBar: 8, startBeat: 2, endBar: 3, endBeat: 1 }, 12))
      .toEqual({ startBar: 3, startBeat: 1, endBar: 8, endBeat: 2 });
  });

  it("keeps beats inside their bar", () => {
    expect(clampTimelineRange({ startBar: 1, startBeat: 0, endBar: 2, endBeat: 17 }, 12))
      .toEqual({ startBar: 1, startBeat: 1, endBar: 2, endBeat: 4 });
  });
});

describe("creating a candidate from a range", () => {
  it("produces the same events as a generated window of the same span", () => {
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 1, startBeat: 1, endBar: 4, endBeat: 4,
    });

    // The hand-drawn block and the generated one are built the same way, so a
    // manual four-bar block is not a second-class version of an automatic one.
    expect(manual.events).toEqual(buildCandidateEvents(timeline, 1, 4, 4));
    expect(manual.lengthBars).toBe(4);
    expect(manual.startBeat).toBe(0);
    expect(manual.endBeat).toBe(16);
  });

  it("builds a span no window generator proposes", () => {
    // The M0 case: a length that is neither a power of two nor a detected
    // section, so no automatic candidate exists for it.
    const spans = new Set(
      buildOccurrences(timeline, 12, { beatsPerBar: 4 })
        .map((occurrence) => `${occurrence.startBar}:${occurrence.endBar}`),
    );
    expect(spans.has("2:12")).toBe(false);

    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 2, startBeat: 1, endBar: 12, endBeat: 4,
    });

    expect(manual.lengthBars).toBe(11);
    expect(manual.events).toHaveLength(11);
    expect(manual.events[0].chord.label).toBe(timeline[1].chord.label);
  });

  it("keeps a partial bar as a partial bar", () => {
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 1, startBeat: 3, endBar: 2, endBeat: 2,
    });

    expect(manual.lengthBars).toBe(1);
    expect(manual.startBeat).toBe(2);
    expect(manual.endBeat).toBe(6);
  });

  it("says so when the block opens mid-chord", () => {
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 1, startBeat: 3, endBar: 2, endBeat: 4,
    });

    expect(manual.events[0].carriedIn).toBe(true);
    expect(manual.warnings).toContain("manual-range-starts-mid-chord");
  });

  it("does not warn when the block opens on a chord change", () => {
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 2, startBeat: 1, endBar: 3, endBeat: 4,
    });

    expect(manual.warnings).not.toContain("manual-range-starts-mid-chord");
  });

  it("marks its provenance and leaves it unranked", () => {
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 1, startBeat: 1, endBar: 4, endBeat: 4,
    });

    expect(isManualRangeOccurrence(manual)).toBe(true);
    // Unscored, like any freshly built window. A user's own selection is not
    // entered into a ranking, so it does not get a score that would win one.
    expect(manual.score).toBe(0);
  });

  it("gives the same selection the same id", () => {
    const range = { startBar: 3, startBeat: 2, endBar: 9, endBeat: 4 };
    expect(manualRangeId(range)).toBe("manual-3.2-9.4");
    expect(createCandidateFromTimelineRange({ timeline, ...range }).id)
      .toBe(createCandidateFromTimelineRange({ timeline, ...range }).id);
  });

  it("groups with an identical automatic occurrence", () => {
    // Same span, same chords: the signatures have to agree or a manual block
    // would show up as a second card for a pattern that is already there.
    const automatic = buildOccurrences(timeline, 12, { beatsPerBar: 4 })
      .find((occurrence) => occurrence.startBar === 1 && occurrence.endBar === 4);
    const manual = createCandidateFromTimelineRange({
      timeline, startBar: 1, startBeat: 1, endBar: 4, endBeat: 4,
    });

    expect(automatic).toBeDefined();
    expect(manual.structuredSignature).toBe(automatic?.structuredSignature);
    expect(manual.relativeSignature).toBe(automatic?.relativeSignature);
  });

  it("throws rather than returning a broken candidate", () => {
    expect(() => createCandidateFromTimelineRange({
      timeline, startBar: 9, startBeat: 1, endBar: 2, endBeat: 4,
    })).toThrow(/end-before-start/);
  });
});
