import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import {
  buildCandidateEvents, candidateEventsAsTimeline, candidateStats, countStructuredRepeats,
  noChordCell, relativeSignature, structuredSignature, summaryFromEvents, sustainCell,
} from "./candidateBlock";

function item(label: string, bar: number, beat = 1, durationBeats = 4): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("candidate events", () => {
  it("keeps both chords of a two-chord bar", () => {
    const timeline = [item("F#m11", 1, 1, 2), item("C7", 1, 3, 2)];
    const events = buildCandidateEvents(timeline, 1, 1);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.chord.label)).toEqual(["F#m11", "C7"]);
    expect(events.map((event) => event.relativeStartBeat)).toEqual([0, 2]);
  });

  it("keeps the full length of a chord sustained across bars", () => {
    const events = buildCandidateEvents([item("Gmaj9/A", 1, 1, 8)], 1, 2);
    expect(events).toHaveLength(1);
    expect(events[0].durationBeats).toBe(8);
    expect(events[0].carriedIn).toBe(false);
  });

  it("includes a chord that sustains in from before the block", () => {
    const timeline = [item("Gmaj9/A", 1, 1, 8), item("Bm7", 3)];
    const events = buildCandidateEvents(timeline, 2, 2);
    expect(events.map((event) => event.chord.label)).toEqual(["Gmaj9/A", "Bm7"]);
    expect(events[0].carriedIn).toBe(true);
    // Clipped to the part that sounds inside the block.
    expect(events[0].relativeStartBeat).toBe(0);
    expect(events[0].durationBeats).toBe(4);
    expect(events[0].sourceDurationBeats).toBe(8);
  });

  it("clips an event that runs past the end of the block", () => {
    const events = buildCandidateEvents([item("Gmaj9/A", 2, 1, 8)], 1, 2);
    expect(events[0].durationBeats).toBe(4);
    expect(events[0].sourceDurationBeats).toBe(8);
  });

  it("respects a non-4/4 bar length", () => {
    // In 3/4, bar 2 starts at beat 3, not beat 4.
    const events = buildCandidateEvents([item("C", 1, 1, 3), item("G", 2, 1, 3)], 1, 2, 3);
    expect(events.map((event) => event.relativeStartBeat)).toEqual([0, 3]);
  });
});

describe("structured signature", () => {
  it("collapses enharmonic spellings", () => {
    const flat = buildCandidateEvents([item("Gbadd9", 1)], 1, 1);
    const sharp = buildCandidateEvents([item("F#add9", 1)], 1, 1);
    expect(structuredSignature(flat)).toBe(structuredSignature(sharp));
  });

  it("keeps a slash chord distinct from its root position", () => {
    const plain = buildCandidateEvents([item("C6", 1)], 1, 1);
    const slash = buildCandidateEvents([item("C6/E", 1)], 1, 1);
    expect(structuredSignature(plain)).not.toBe(structuredSignature(slash));
  });

  it("distinguishes blocks that a per-bar summary would flatten together", () => {
    // Both bars read as "F#m11" once compressed to one label per bar, but one
    // of them also contains a second chord.
    const oneChord = buildCandidateEvents([item("F#m11", 1)], 1, 1);
    const twoChords = buildCandidateEvents([item("F#m11", 1, 1, 2), item("C7", 1, 3, 2)], 1, 1);
    expect(structuredSignature(oneChord)).not.toBe(structuredSignature(twoChords));
  });

  it("distinguishes the same chords at different positions", () => {
    const early = buildCandidateEvents([item("C", 1, 1, 2), item("G", 1, 3, 2)], 1, 1);
    const late = buildCandidateEvents([item("C", 1, 1, 3), item("G", 1, 4, 1)], 1, 1);
    expect(structuredSignature(early)).not.toBe(structuredSignature(late));
  });

  it("matches the same shape transposed under the relative signature", () => {
    const inC = buildCandidateEvents([item("C", 1), item("F", 2)], 1, 2);
    const inD = buildCandidateEvents([item("D", 1), item("G", 2)], 1, 2);
    expect(structuredSignature(inC)).not.toBe(structuredSignature(inD));
    expect(relativeSignature(inC)).toBe(relativeSignature(inD));
  });

  it("counts repeats of the same structure across the timeline", () => {
    const timeline = [item("C", 1), item("F", 2), item("C", 3), item("F", 4)];
    const signature = structuredSignature(buildCandidateEvents(timeline, 1, 2));
    expect(countStructuredRepeats(timeline, 4, 2, signature)).toBe(2);
  });
});

describe("summary text", () => {
  it("lists both chords of a two-chord bar", () => {
    const events = buildCandidateEvents([item("F#m11", 1, 1, 2), item("C7", 1, 3, 2)], 1, 1);
    expect(summaryFromEvents(events, 1)).toBe("| F#m11 · C7 |");
  });

  it("marks the continuation of a sustained chord instead of dropping it", () => {
    const events = buildCandidateEvents([item("Gmaj9/A", 1, 1, 8)], 1, 2);
    expect(summaryFromEvents(events, 2)).toBe(`| Gmaj9/A | ${sustainCell} |`);
  });

  it("marks a genuinely empty bar as no chord", () => {
    const events = buildCandidateEvents([item("C", 1)], 1, 2);
    expect(summaryFromEvents(events, 2)).toBe(`| C | ${noChordCell} |`);
  });

  it("keeps one cell per bar", () => {
    const timeline = [item("Dmaj7", 1), item("Dm7", 2), item("C#m7", 3), item("F#m11", 4, 1, 2), item("C7", 4, 3, 2)];
    const events = buildCandidateEvents(timeline, 1, 4);
    expect(summaryFromEvents(events, 4).split("|")).toHaveLength(6);
    expect(summaryFromEvents(events, 4)).toBe("| Dmaj7 | Dm7 | C#m7 | F#m11 · C7 |");
  });
});

describe("stats", () => {
  it("separates event count from unique chord count", () => {
    const timeline = [item("C", 1), item("F", 2), item("C", 3), item("F", 4)];
    const stats = candidateStats(buildCandidateEvents(timeline, 1, 4), 4);
    expect(stats.eventCount).toBe(4);
    expect(stats.uniqueChordCount).toBe(2);
    expect(stats.harmonicChangeCount).toBe(4);
    expect(stats.chordEventsPerBar).toBe(1);
  });

  it("classifies a single-chord block as a vamp", () => {
    const stats = candidateStats(buildCandidateEvents([item("C", 1, 1, 16)], 1, 4), 4);
    expect(stats.densityClass).toBe("vamp");
    expect(stats.uniqueChordCount).toBe(1);
  });

  it("classifies a two-chords-per-bar block as dense", () => {
    const timeline = [
      item("C", 1, 1, 2), item("F", 1, 3, 2),
      item("G", 2, 1, 2), item("Am", 2, 3, 2),
    ];
    expect(candidateStats(buildCandidateEvents(timeline, 1, 2), 2).densityClass).toBe("dense");
  });

  it("classifies a handful of chords as compact", () => {
    const timeline = [item("C", 1), item("F", 2), item("G", 3), item("Am", 4)];
    expect(candidateStats(buildCandidateEvents(timeline, 1, 4), 4).densityClass).toBe("compact");
  });
});

describe("save conversion", () => {
  it("restores absolute timing and keeps the source alternatives", () => {
    const source: ChordTimelineItem = {
      ...item("Bm7", 5),
      alternatives: [{ chord: parseChordLabel("D6")!, confidence: 0.4 }],
    };
    const events = buildCandidateEvents([source], 5, 1);
    const restored = candidateEventsAsTimeline(events, 5);
    expect(restored[0].bar).toBe(5);
    expect(restored[0].beat).toBe(1);
    expect(restored[0].alternatives).toHaveLength(1);
  });

  it("retimes a carried-in chord to the start of the saved block", () => {
    const timeline = [item("Gmaj9/A", 1, 1, 8), item("Bm7", 3)];
    const restored = candidateEventsAsTimeline(buildCandidateEvents(timeline, 2, 2), 2);
    expect(restored.map((entry) => [entry.bar, entry.beat, entry.durationBeats]))
      .toEqual([[2, 1, 4], [3, 1, 4]]);
  });

  it("keeps both chords of a two-chord bar through the round trip", () => {
    const timeline = [item("F#m11", 4, 1, 2), item("C7", 4, 3, 2)];
    const restored = candidateEventsAsTimeline(buildCandidateEvents(timeline, 4, 1), 4);
    expect(restored.map((entry) => `${entry.chord.label}@${entry.bar}.${entry.beat}`))
      .toEqual(["F#m11@4.1", "C7@4.3"]);
  });
});
