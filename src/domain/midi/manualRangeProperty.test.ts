import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordTimelineItem } from "../types";
import { createManualDraft } from "./manualDraft";
import { draftEditable, validateDraft } from "./manualDraftEditing";
import { draftPreviewTimeline } from "./manualDraftPlayback";
import { timelineRangeBeats, timelineRangeIssues } from "./manualRange";

/**
 * Arbitrary ranges, so nothing is tuned to the lengths that happened to fail.
 *
 * The two lengths M0 found unreachable were 19 and 22 bars. A fix that works for
 * 19 and 22 is not a fix; it is a pair of special cases waiting to be found out
 * by a 23-bar section. These run several hundred ranges from a fixed seed over
 * material that includes rests, two chords in a bar and chords that sustain
 * across bar lines, and assert the same properties for all of them.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

/** Deterministic, so a failure is reproducible from the seed alone. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const TOTAL_BARS = 96;
const BEATS_PER_BAR = 4;

/**
 * A song with the awkward parts in it.
 *
 * Every fourth bar carries two chords, every seventh sustains across the bar
 * line, every eleventh is silent. A range that lands on any of those has to work
 * the same as one that lands on a plain bar.
 */
function awkwardTimeline(): ChordTimelineItem[] {
  const items: ChordTimelineItem[] = [];
  for (let bar = 1; bar <= TOTAL_BARS; bar += 1) {
    if (bar % 11 === 0) continue;
    const base = { confidence: 0.9, alternatives: [], warnings: [] };
    if (bar % 4 === 0) {
      items.push({ bar, beat: 1, durationBeats: 2, chord: chord((bar * 5) % 12), ...base });
      items.push({ bar, beat: 3, durationBeats: 2, chord: chord((bar * 7) % 12, "min7"), ...base });
      continue;
    }
    if (bar % 7 === 0) {
      items.push({ bar, beat: 3, durationBeats: 6, chord: chord((bar * 3) % 12, "dom7"), ...base });
      continue;
    }
    items.push({ bar, beat: 1, durationBeats: 4, chord: chord((bar * 5) % 12), ...base });
  }
  return items.sort((left, right) => (left.bar - right.bar) || (left.beat - right.beat));
}

const timeline = awkwardTimeline();

interface Sample {
  startBar: number;
  startBeat: number;
  endBar: number;
  endBeat: number;
  lengthBars: number;
}

function samples(seed: number, count: number): Sample[] {
  const random = makeRandom(seed);
  const result: Sample[] = [];
  while (result.length < count) {
    const lengthBars = 1 + Math.floor(random() * 64);
    const startBar = 1 + Math.floor(random() * (TOTAL_BARS - 1));
    const endBar = Math.min(TOTAL_BARS, startBar + lengthBars - 1);
    // Beat 1 and beat 3 both matter: a range starting off the downbeat is the
    // case an anticipated chord change produces.
    const startBeat = random() < 0.3 ? 3 : 1;
    const endBeat = random() < 0.3 ? 2 : BEATS_PER_BAR;
    result.push({ startBar, startBeat, endBar, endBeat, lengthBars: endBar - startBar + 1 });
  }
  return result;
}

describe("any range, not just the ones that failed", () => {
  const cases = samples(20260726, 300)
    .filter((sample) => timelineRangeIssues({
      timeline, beatsPerBar: BEATS_PER_BAR, ...sample,
    }).length === 0);

  it("produces enough usable ranges to be worth calling a property test", () => {
    expect(cases.length).toBeGreaterThan(200);
    expect(new Set(cases.map((sample) => sample.lengthBars)).size).toBeGreaterThan(40);
  });

  it("builds a draft for every usable range", () => {
    for (const sample of cases) {
      const draft = createManualDraft({
        timeline,
        range: sample,
        beatsPerBar: BEATS_PER_BAR,
        now: "2026-07-26T00:00:00.000Z",
      });
      expect(draft.events.length).toBeGreaterThan(0);
      expect(draft.selectedRange.startBar).toBe(sample.startBar);
      expect(draft.selectedRange.endBar).toBe(sample.endBar);
    }
  });

  it("keeps every event inside the range it was cut from", () => {
    for (const sample of cases) {
      const draft = createManualDraft({
        timeline, range: sample, beatsPerBar: BEATS_PER_BAR, now: "2026-07-26T00:00:00.000Z",
      });
      const { startBeat, endBeat } = timelineRangeBeats(sample, BEATS_PER_BAR);
      const total = endBeat - startBeat;
      for (const event of draft.events) {
        expect(event.relativeStartBeat).toBeGreaterThanOrEqual(0);
        expect(event.relativeStartBeat + event.durationBeats).toBeLessThanOrEqual(total + 1e-6);
        expect(event.durationBeats).toBeGreaterThan(0);
      }
    }
  });

  it("produces a draft that can be saved", () => {
    for (const sample of cases) {
      const draft = createManualDraft({
        timeline, range: sample, beatsPerBar: BEATS_PER_BAR, now: "2026-07-26T00:00:00.000Z",
      });
      expect(validateDraft(draft).errors).toEqual([]);
      expect(validateDraft(draft).canSave).toBe(true);
    }
  });

  it("reaches the editor with one slot per event", () => {
    for (const sample of cases) {
      const draft = createManualDraft({
        timeline, range: sample, beatsPerBar: BEATS_PER_BAR, now: "2026-07-26T00:00:00.000Z",
      });
      expect(draftEditable(draft).slots).toHaveLength(draft.events.length);
      expect(draftPreviewTimeline(draft)).toHaveLength(draft.events.length);
    }
  });

  it("gives the same draft three times over", () => {
    for (const sample of cases.slice(0, 60)) {
      const build = () => createManualDraft({
        timeline, range: sample, beatsPerBar: BEATS_PER_BAR, now: "2026-07-26T00:00:00.000Z",
      });
      const first = JSON.stringify(build().events);
      expect(JSON.stringify(build().events)).toBe(first);
      expect(JSON.stringify(build().events)).toBe(first);
    }
  });

  it.each([11, 13, 17, 19, 21, 22, 23, 27])(
    "handles a %i-bar range wherever it starts",
    (lengthBars) => {
      for (let startBar = 1; startBar + lengthBars - 1 <= TOTAL_BARS; startBar += 1) {
        const range = {
          startBar, startBeat: 1, endBar: startBar + lengthBars - 1, endBeat: BEATS_PER_BAR,
        };
        if (timelineRangeIssues({ timeline, beatsPerBar: BEATS_PER_BAR, ...range }).length > 0) continue;
        const draft = createManualDraft({
          timeline, range, beatsPerBar: BEATS_PER_BAR, now: "2026-07-26T00:00:00.000Z",
        });
        expect(draft.lengthBars).toBe(lengthBars);
        expect(validateDraft(draft).canSave).toBe(true);
      }
    },
  );
});
