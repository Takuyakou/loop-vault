import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { loopFitnessScore, normaliseEvidence, qualityFloor, scoreBlockQuality } from "./blockQuality";
import { buildCandidateEvents, candidateStats } from "./candidateBlock";
import { extractBlockCandidates } from "./legacy";

/** One chord per bar unless `perBar` splits the bar. */
function timeline(labels: readonly string[], perBar = 1): ChordTimelineItem[] {
  const beats = 4 / perBar;
  return labels.map((label, index) => ({
    bar: Math.floor(index / perBar) + 1,
    beat: (index % perBar) * beats + 1,
    durationBeats: beats,
    chord: parseChordLabel(label)!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  }));
}

function repeated(pattern: readonly string[], times: number): string[] {
  return Array.from({ length: times }, () => [...pattern]).flat();
}

function densityOf(items: ChordTimelineItem[], totalBars: number): string {
  return candidateStats(buildCandidateEvents(items, 1, totalBars), totalBars).densityClass;
}

describe("low-density blocks survive candidate generation", () => {
  const cases: Array<{ name: string; items: ChordTimelineItem[]; bars: number }> = [
    { name: "8 bars, 1 chord", items: timeline(repeated(["C"], 8)), bars: 8 },
    { name: "8 bars, 2 chords", items: timeline(repeated(["C", "F"], 4)), bars: 8 },
    { name: "8 bars, 3 chords", items: timeline([...repeated(["C", "F", "G"], 2), "C", "F"]), bars: 8 },
    { name: "8 bars, 4 chords", items: timeline(repeated(["C", "F", "G", "Am"], 2)), bars: 8 },
    { name: "8 bars, 5 chords", items: timeline(["C", "F", "G", "Am", "Dm", "C", "F", "G"]), bars: 8 },
    { name: "8 bars, 8 chords", items: timeline(["C", "F", "G", "Am", "Dm", "Em", "Bb", "Eb"]), bars: 8 },
    { name: "16 bars, 5 chords", items: timeline([...repeated(["C", "F", "G", "Am", "Dm"], 3), "C"]), bars: 16 },
    { name: "same chord repeated", items: timeline(repeated(["C"], 16)), bars: 16 },
  ];

  it.each(cases)("keeps $name in the raw candidate set", ({ items, bars }) => {
    const candidates = extractBlockCandidates(items, bars);
    expect(candidates.length).toBeGreaterThan(0);
    // The whole-piece block is present regardless of how few chords it holds.
    expect(candidates.some((candidate) => candidate.startBar === 1)).toBe(true);
  });

  it("does not drop a one-chord vamp for being a vamp", () => {
    const items = timeline(repeated(["C"], 8));
    expect(densityOf(items, 8)).toBe("vamp");
    const candidates = extractBlockCandidates(items, 8);
    expect(candidates.some((candidate) => candidate.stats?.densityClass === "vamp")).toBe(true);
  });

  it("offers a two-bar loop at its own length", () => {
    const items = timeline(repeated(["C", "F"], 4));
    const candidates = extractBlockCandidates(items, 8);
    const twoBar = candidates.filter((candidate) => candidate.lengthBars === 2);
    expect(twoBar.length).toBeGreaterThan(0);
    expect(twoBar[0].repeatCount).toBeGreaterThan(1);
  });

  it("keeps both chords of a one-bar two-chord pattern", () => {
    const items = timeline(repeated(["C", "F"], 4), 2);
    const candidates = extractBlockCandidates(items, 4);
    const block = candidates.find((candidate) => candidate.lengthBars === 2);
    expect(block?.stats?.densityClass).toBe("dense");
    expect(block?.summaryText).toContain("·");
  });

  it("still surfaces busy blocks", () => {
    const items = timeline(["C", "F", "G", "Am", "Dm", "Em", "Bb", "Eb"]);
    const candidates = extractBlockCandidates(items, 8);
    expect(candidates.some((candidate) => candidate.stats?.densityClass === "standard"
      || candidate.stats?.densityClass === "dense")).toBe(true);
  });

  it("respects the candidate limit and stays deterministic", () => {
    const items = timeline(repeated(["C", "F", "G", "Am"], 4));
    const first = extractBlockCandidates(items, 16);
    const second = extractBlockCandidates(items, 16);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(second).toEqual(first);
  });

  it("mixes block lengths rather than filling the list with the shortest", () => {
    const items = timeline(repeated(["C", "F", "G", "Am"], 4));
    const candidates = extractBlockCandidates(items, 16);
    expect(new Set(candidates.map((candidate) => candidate.lengthBars)).size)
      .toBeGreaterThan(1);
  });
});

describe("block quality score", () => {
  const normalise = normaliseEvidence([0.6, 1.0, 1.3]);

  it("does not reward a block for holding more distinct chords", () => {
    const vamp = buildCandidateEvents(timeline(repeated(["C"], 4)), 1, 4);
    const varied = buildCandidateEvents(timeline(["C", "F", "G", "Am"]), 1, 4);
    const options = { repeatCount: 1, beatsPerBar: 4, normaliseEvidence: normalise };
    // Same evidence and boundaries, different chord counts: the only difference
    // left is loop fitness, never a diversity bonus.
    const vampScore = scoreBlockQuality(vamp, options);
    const variedScore = scoreBlockQuality(varied, options);
    expect(vampScore.evidence).toBe(variedScore.evidence);
    expect(vampScore.boundary).toBe(variedScore.boundary);
  });

  it("rewards a shape that recurs", () => {
    const events = buildCandidateEvents(timeline(["C", "F"]), 1, 2);
    const once = scoreBlockQuality(events, { repeatCount: 1, beatsPerBar: 4, normaliseEvidence: normalise });
    const thrice = scoreBlockQuality(events, { repeatCount: 3, beatsPerBar: 4, normaliseEvidence: normalise });
    expect(thrice.repeat).toBeGreaterThan(once.repeat);
    expect(thrice.total).toBeGreaterThan(once.total);
  });

  it("saturates the repeat term instead of rewarding it without limit", () => {
    const events = buildCandidateEvents(timeline(["C", "F"]), 1, 2);
    const options = { beatsPerBar: 4, normaliseEvidence: normalise };
    const three = scoreBlockQuality(events, { ...options, repeatCount: 3 });
    const twenty = scoreBlockQuality(events, { ...options, repeatCount: 20 });
    expect(twenty.repeat).toBe(three.repeat);
  });

  it("scores a dominant return above an unrelated one", () => {
    const cadence = buildCandidateEvents(timeline(["C", "G"]), 1, 2);
    const unrelated = buildCandidateEvents(timeline(["C", "F#"]), 1, 2);
    expect(loopFitnessScore(cadence)).toBeGreaterThan(loopFitnessScore(unrelated));
  });

  it("returns neutral evidence when a file offers nothing to discriminate on", () => {
    const flat = normaliseEvidence([1.2, 1.2, 1.2]);
    expect(flat(1.2)).toBe(0.5);
    expect(flat(0.1)).toBe(0.5);
  });

  it("maps the observed range onto the unit interval", () => {
    expect(normalise(0.6)).toBe(0);
    expect(normalise(1.3)).toBe(1);
    expect(normalise(0.95)).toBeGreaterThan(0);
    expect(normalise(0.95)).toBeLessThan(1);
  });

  it("keeps the quality floor inside the score range", () => {
    expect(qualityFloor).toBeGreaterThan(0);
    expect(qualityFloor).toBeLessThan(1);
  });
});
