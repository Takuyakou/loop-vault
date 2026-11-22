import { describe, expect, it } from "vitest";
import type { EarChordRecord } from "./earRecords";
import { figuresOf, recentPlays } from "./earStats";

let counter = 0;

/** P23-21 E13: the records a run through one question leaves behind (one per chord). */
function rec(patch: Partial<EarChordRecord> = {}): EarChordRecord {
  counter += 1;
  return {
    at: "2026-10-14T03:00:00.000Z",
    play: `play-${counter}`,
    questionId: `bank:q${counter}`,
    source: "bank",
    level: 1,
    length: 4,
    chordLevel: 1,
    kind: "三和音",
    index: 0,
    given: false,
    manual: false,
    wrongs: 0,
    hint: 0,
    seconds: 2,
    replays: 0,
    judge: "core",
    degreeShown: false,
    ...patch,
  } as EarChordRecord;
}

describe("recentPlays (P23-21 E13)", () => {
  it("C4: one entry per run, the newest chord of the run dates it, and its rate is figuresOf over its chords", () => {
    const records = [
      rec({ play: "a", at: "2026-10-14T03:00:00.000Z", index: 0 }),
      rec({ play: "a", at: "2026-10-14T03:00:30.000Z", index: 1, wrongs: 1 }),
      rec({ play: "b", at: "2026-10-15T03:00:00.000Z", index: 0 }),
      rec({ play: "b", at: "2026-10-15T03:00:20.000Z", index: 1 }),
    ];

    const plays = recentPlays(records);
    expect(plays).toHaveLength(2);
    expect(plays.map((entry) => entry.play)).toEqual(["b", "a"]);
    // The run's time is its newest chord.
    expect(plays[1]?.at).toBe("2026-10-14T03:00:30.000Z");
    // The rate is the same as figuresOf over that run's chords alone.
    expect(plays[1]?.figures).toEqual(figuresOf(records.filter((record) => record.play === "a")));
    expect(plays[1]?.figures.firstTryRate).toBe(0.5);
    expect(plays[0]?.figures.firstTryRate).toBe(1);
  });

  it("C4: at most three by default, and a benchmark run is marked", () => {
    const records = [
      rec({ play: "old", at: "2026-10-01T03:00:00.000Z" }),
      rec({ play: "two", at: "2026-10-02T03:00:00.000Z" }),
      rec({ play: "three", at: "2026-10-03T03:00:00.000Z", length: 8, level: 3, source: "builtin" }),
      rec({ play: "four", at: "2026-10-04T03:00:00.000Z", benchmark: 2, run: "bench-1" }),
    ];

    const plays = recentPlays(records);
    expect(plays.map((entry) => entry.play)).toEqual(["four", "three", "two"]);
    expect(plays[0]).toMatchObject({ benchmark: true, level: 1, length: 4, source: "bank" });
    expect(plays[1]).toMatchObject({ benchmark: false, level: 3, length: 8, source: "builtin" });
    expect(recentPlays(records, 1).map((entry) => entry.play)).toEqual(["four"]);
    expect(recentPlays(records, 0)).toEqual([]);
  });

  it("C4: a run with no chord to measure has no rate, and an empty record list has no entries", () => {
    const plays = recentPlays([
      rec({ play: "given", given: true }),
      rec({ play: "manual", manual: true }),
    ]);
    expect(plays).toHaveLength(2);
    expect(plays.every((entry) => entry.figures.firstTryRate === undefined)).toBe(true);
    expect(recentPlays([])).toEqual([]);
  });
});
