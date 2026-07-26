import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { buildCandidateCatalog } from "./candidateCatalog";
import { recommendPatterns } from "./candidateRecommendation";
import { buildOccurrences, groupIntoPatterns } from "./occurrence";
import { createManualDraft, editOperationCount, fingerprintTimeline, draftMatchesTimeline } from "./manualDraft";
import {
  beginSelection,
  endSelectionDrag,
  moveSelectionFocus,
  nudgeSelectionEdge,
  selectionRange,
  summariseSelection,
} from "./timelineRangeSelection";

/**
 * Selecting a range, as data.
 *
 * The lengths here are the ones M0 found unreachable — 19 and 22 bars — plus a
 * spread of other odd lengths, because a fix that only works for the two lengths
 * that happened to fail is not a fix.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function barsOf(count: number): ChordTimelineItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: chord((index * 5) % 12),
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

const TOTAL_BARS = 108;
const timeline = barsOf(TOTAL_BARS);

function select(startBar: number, endBar: number) {
  return endSelectionDrag(
    moveSelectionFocus(beginSelection({ bar: startBar, beat: 1 }), { bar: endBar, beat: 4 }),
  );
}

describe("dragging a range", () => {
  it("keeps the anchor while the other end moves", () => {
    const selection = select(14, 32);
    expect(selectionRange(selection, TOTAL_BARS))
      .toEqual({ startBar: 14, startBeat: 1, endBar: 32, endBeat: 4 });
  });

  it("reads a backwards drag as the range between the two points", () => {
    expect(selectionRange(select(32, 14), TOTAL_BARS))
      .toEqual({ startBar: 14, startBeat: 4, endBar: 32, endBeat: 1 });
  });

  it("stops at the last bar of the song", () => {
    expect(selectionRange(select(100, 400), TOTAL_BARS).endBar).toBe(TOTAL_BARS);
  });
});

describe("nudging an edge", () => {
  it("moves the end by one beat", () => {
    const moved = nudgeSelectionEdge(select(14, 32), "end", 1, TOTAL_BARS);
    expect(selectionRange(moved, TOTAL_BARS))
      .toEqual({ startBar: 14, startBeat: 1, endBar: 33, endBeat: 1 });
  });

  it("moves the end by one bar", () => {
    const moved = nudgeSelectionEdge(select(14, 32), "end", 4, TOTAL_BARS);
    expect(selectionRange(moved, TOTAL_BARS).endBar).toBe(33);
  });

  it("moves the start without touching the end", () => {
    const moved = nudgeSelectionEdge(select(14, 32), "start", -4, TOTAL_BARS);
    const range = selectionRange(moved, TOTAL_BARS);
    expect(range.startBar).toBe(13);
    expect(range.endBar).toBe(32);
  });

  it("collapses rather than inverting when an edge is pushed past the other", () => {
    const moved = nudgeSelectionEdge(select(14, 14), "end", -40, TOTAL_BARS);
    const range = selectionRange(moved, TOTAL_BARS);
    expect(range.startBar).toBeLessThanOrEqual(range.endBar);
  });

  it("stops at the end of the song", () => {
    const moved = nudgeSelectionEdge(select(105, TOTAL_BARS), "end", 400, TOTAL_BARS);
    expect(selectionRange(moved, TOTAL_BARS).endBar).toBe(TOTAL_BARS);
  });
});

describe("summarising a selection", () => {
  it("reports the length and the chord count", () => {
    const summary = summariseSelection(select(14, 32), timeline, TOTAL_BARS);

    expect(summary.lengthBars).toBe(19);
    expect(summary.chordEventCount).toBe(19);
    expect(summary.canCreate).toBe(true);
  });

  it.each([1, 4, 8, 11, 13, 16, 17, 19, 21, 22, 23, 27, 32, 64])(
    "handles a %i-bar range",
    (length) => {
      const summary = summariseSelection(select(5, 4 + length), timeline, TOTAL_BARS);
      expect(summary.lengthBars).toBe(length);
      expect(summary.canCreate).toBe(true);
    },
  );

  it("says when nothing sounds in the range", () => {
    const short = barsOf(4);
    const summary = summariseSelection(select(20, 24), short, 40);

    expect(summary.silent).toBe(true);
    expect(summary.canCreate).toBe(false);
    expect(summary.issues).toContain("no-chords-in-range");
  });

  it("keeps two chords in one bar", () => {
    const twoPerBar: ChordTimelineItem[] = [
      { bar: 1, beat: 1, durationBeats: 2, chord: chord(0), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 1, beat: 3, durationBeats: 2, chord: chord(7), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 2, beat: 1, durationBeats: 4, chord: chord(5), confidence: 0.9, alternatives: [], warnings: [] },
    ];
    expect(summariseSelection(select(1, 2), twoPerBar, 2).chordEventCount).toBe(3);
  });

  it("includes a chord that started before the range", () => {
    const sustained: ChordTimelineItem[] = [
      { bar: 1, beat: 1, durationBeats: 16, chord: chord(0), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 5, beat: 1, durationBeats: 4, chord: chord(7), confidence: 0.9, alternatives: [], warnings: [] },
    ];
    const summary = summariseSelection(select(3, 5), sustained, 6);

    expect(summary.chordEventCount).toBe(2);
    expect(summary.startsMidChord).toBe(true);
  });
});

describe("creating a draft", () => {
  it("cuts the 19-bar region M0 could not reach", () => {
    const draft = createManualDraft({
      timeline,
      range: selectionRange(select(14, 32), TOTAL_BARS),
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(draft.lengthBars).toBe(19);
    expect(draft.events).toHaveLength(19);
    expect(draft.source).toBe("manual-range");
    expect(draft.isDirty).toBe(false);
    expect(draft.repairOperations).toEqual([{ type: "create-from-range" }]);
    expect(editOperationCount(draft)).toBe(0);
  });

  it("cuts the 22-bar region too", () => {
    const draft = createManualDraft({
      timeline,
      range: selectionRange(select(87, 108), TOTAL_BARS),
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(draft.lengthBars).toBe(22);
    expect(draft.events).toHaveLength(22);
  });

  it("keeps the original events separate from the editable ones", () => {
    const draft = createManualDraft({
      timeline,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    draft.events[0] = { ...draft.events[0], chord: chord(11) };

    expect(draft.originalEvents[0].chord.label).not.toBe(draft.events[0].chord.label);
  });

  it("ties the draft to the timeline it was cut from", () => {
    const draft = createManualDraft({
      timeline,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(draftMatchesTimeline(draft, timeline)).toBe(true);
    expect(draftMatchesTimeline(draft, barsOf(TOTAL_BARS - 1))).toBe(false);
  });

  it("fingerprints deterministically", () => {
    expect(fingerprintTimeline(timeline)).toBe(fingerprintTimeline(timeline));
    expect(fingerprintTimeline(timeline)).not.toBe(fingerprintTimeline(barsOf(4)));
  });

  it("leaves the automatic catalog and recommendation untouched", () => {
    // The draft is a detached object by construction, so this passes today. It is
    // asserted anyway: the whole reason drafts are kept off the catalog path is
    // that a `score: 0` candidate would be dropped by the quality floor, and a
    // later change that "helpfully" adds drafts to the catalog would reintroduce
    // exactly that as a card silently going missing.
    const occurrences = buildOccurrences(timeline, TOTAL_BARS, { beatsPerBar: 4 })
      .map((occurrence) => ({ ...occurrence, score: 0.7 }));
    const build = () => {
      const catalog = buildCandidateCatalog({
        patterns: groupIntoPatterns(occurrences),
        harmonicActiveBars: Array.from({ length: TOTAL_BARS }, (_u, index) => index + 1),
        qualityFloor: 0.35,
        rawWindowCount: occurrences.length,
      });
      return { catalog, recommendation: recommendPatterns(catalog) };
    };

    const before = build();
    createManualDraft({
      timeline,
      range: selectionRange(select(14, 32), TOTAL_BARS),
      now: "2026-07-26T00:00:00.000Z",
    });
    const after = build();

    expect(after.catalog.patterns.length).toBe(before.catalog.patterns.length);
    expect(JSON.stringify(after.recommendation)).toBe(JSON.stringify(before.recommendation));
    expect(after.catalog.patterns.some(
      (pattern) => pattern.occurrences.some((occurrence) => occurrence.id.startsWith("manual-")),
    )).toBe(false);
  });

  it("does not touch the timeline it was cut from", () => {
    const snapshot = JSON.stringify(timeline);
    createManualDraft({
      timeline,
      range: selectionRange(select(14, 32), TOTAL_BARS),
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(JSON.stringify(timeline)).toBe(snapshot);
  });

  it("builds the same draft three times over", () => {
    const range = selectionRange(select(14, 32), TOTAL_BARS);
    const build = () => createManualDraft({ timeline, range, now: "2026-07-26T00:00:00.000Z" });

    expect(JSON.stringify(build().events)).toBe(JSON.stringify(build().events));
    expect(build().draftId).toBe(build().draftId);
  });
});
