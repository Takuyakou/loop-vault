import { describe, expect, it } from "vitest";
import { recentPlaySeries } from "./earStats";
import type { EarChordRecord } from "./earRecords";

/**
 * P23-23b X11/C5: the points behind the result's two bar charts: one per run, same level and length,
 * oldest first, benchmarks left out, at most twelve.
 */
const record = (overrides: Partial<EarChordRecord> & { play: string; at: string; index: number }): EarChordRecord => ({
  level: 1,
  length: 4,
  source: "bank",
  questionId: "q",
  chordLevel: 1,
  kind: "major",
  given: false,
  manual: false,
  wrongs: 0,
  hint: 0,
  replays: 0,
  seconds: 2,
  judge: "core",
  ...overrides,
});

const run = (play: string, at: string, level: 1 | 2 = 1, length: 4 | 8 = 4, extra: Partial<EarChordRecord> = {}) => [
  record({ play, at, index: 0, level, length, ...extra }),
  record({ play, at: `${at.slice(0, 11)}${String(Number(at.slice(11, 13)) + 1).padStart(2, "0")}${at.slice(13)}`, index: 1, level, length, ...extra }),
];

describe("recentPlaySeries (P23-23b X11)", () => {
  it("keeps one point per run, old first, and the newest count only", () => {
    const records = [
      ...run("a", "2026-10-01T10:00:00Z"),
      ...run("b", "2026-10-02T10:00:00Z"),
      ...run("c", "2026-10-03T10:00:00Z"),
    ];
    expect(recentPlaySeries(records, { level: 1, length: 4 }).map((point) => point.play)).toEqual(["a", "b", "c"]);
    expect(recentPlaySeries(records, { level: 1, length: 4, count: 2 }).map((point) => point.play)).toEqual(["b", "c"]);
  });

  it("leaves out another level or another length", () => {
    const records = [
      ...run("mine", "2026-10-01T10:00:00Z"),
      ...run("level2", "2026-10-02T10:00:00Z", 2, 4),
      ...run("length8", "2026-10-03T10:00:00Z", 1, 8),
    ];
    expect(recentPlaySeries(records, { level: 1, length: 4 }).map((point) => point.play)).toEqual(["mine"]);
  });

  it("leaves out the benchmark runs", () => {
    const records = [...run("normal", "2026-10-01T10:00:00Z"), ...run("bench", "2026-10-02T10:00:00Z", 1, 4, { benchmark: 1 })];
    expect(recentPlaySeries(records, { level: 1, length: 4 }).map((point) => point.play)).toEqual(["normal"]);
  });

  it("counts a run once and gives its figures", () => {
    const records = [
      ...run("a", "2026-10-01T10:00:00Z"),
      record({ play: "a", at: "2026-10-01T10:00:05Z", index: 2, wrongs: 1 }),
    ];
    const [point] = recentPlaySeries(records, { level: 1, length: 4 });
    expect(point?.play).toBe("a");
    expect(point?.figures.chords).toBe(3);
    expect(point?.figures.measured).toBe(3);
    expect(point?.figures.firstTry).toBe(2);
  });
});
