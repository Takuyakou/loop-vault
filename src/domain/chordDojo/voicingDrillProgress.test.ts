import { describe, expect, it } from "vitest";
import type { DrillRecordCard, VoicingDrillRecords } from "./voicingDrillRecords";
import {
  drillBestOfKey,
  drillBestOfSet,
  drillKeyBests,
  drillKeyName,
  drillNewestLast,
  drillPaceTotal,
  drillPriorRevisions,
  drillSlowCards,
  formatDrillLap,
  formatDrillSeconds,
} from "./voicingDrillProgress";
import { DRILL_SETS, drillSetById, drillSetRevision } from "./voicingDrill";

const cards: DrillRecordCard[] = [
  { id: "1", label: "C", degree: "I", form: null, left: [48], right: [64, 67, 71] },
  { id: "2", label: "Am7", degree: "VIm7", form: null, left: [45], right: [64, 67, 71] },
];
const lap = (totalMs: number, cardMs: readonly number[], at: string, marks: readonly number[] = []) => ({ totalMs, cardMs, at, marks });
const file = {
  app: "loopvault-voicing-drill",
  fileVersion: 1,
  version: 1,
  revision: 4,
  operations: [],
  sets: {
    "cycle-a": {
      rev1: {
        cards,
        keys: {
          0: { see: { laps: 2, best: lap(2000, [1000, 1000], "2026-11-01T00:00:00.000Z"), last: lap(3200, [1600, 1600], "2026-11-02T00:00:00.000Z", [1]) } },
          7: { see: { laps: 1, best: lap(1500, [700, 800], "2026-11-03T00:00:00.000Z") } },
        },
      },
      rev2: {
        cards,
        keys: {
          0: { recall: { laps: 1, best: lap(1800, [900, 900], "2026-11-04T00:00:00.000Z") } },
          7: { see: { laps: 1, best: lap(1200, [600, 600], "2026-11-05T00:00:00.000Z"), last: lap(1300, [650, 650], "2026-11-06T00:00:00.000Z") } },
        },
      },
    },
  },
} as unknown as VoicingDrillRecords;

describe("P19 voicing drill record reading", () => {
  it("finds the fastest lap of a set across the keys and the stages, and only in its own revision", () => {
    expect(drillBestOfSet(file, "cycle-a", "rev2")).toEqual({ totalMs: 1200, key: 7, stage: "see" });
    expect(drillBestOfSet(file, "cycle-a", "rev2", ["recall"])).toEqual({ totalMs: 1800, key: 0, stage: "recall" });
    expect(drillBestOfSet(file, "cycle-a", "rev1")).toEqual({ totalMs: 1500, key: 7, stage: "see" });
    expect(drillBestOfSet(file, "cycle-a", "missing")).toBeUndefined();
  });

  it("reads one key's best, and the twelve keys of one stage", () => {
    expect(drillBestOfKey(file, "cycle-a", "rev2", 0)).toEqual({ totalMs: 1800, key: 0, stage: "recall" });
    expect(drillBestOfKey(file, "cycle-a", "rev2", 7, "see")).toEqual({ totalMs: 1200, key: 7, stage: "see" });
    const bests = drillKeyBests(file, "cycle-a", "rev2", "see");
    expect(bests).toHaveLength(12);
    expect(bests[0]).toBeUndefined();
    expect(bests[7]).toBe(1200);
    expect(drillKeyBests(file, "cycle-a", "rev2", "recall")[0]).toBe(1800);
  });

  it("finds the newest last lap for the line before the practice", () => {
    expect(drillNewestLast(file, "cycle-a", "rev2", "see")).toEqual({ key: 7, last: lap(1300, [650, 650], "2026-11-06T00:00:00.000Z") });
    expect(drillNewestLast(file, "cycle-a", "rev2", "recall")).toBeUndefined();
  });

  it("lists the records of the earlier content revisions apart", () => {
    expect(drillPriorRevisions(file, "cycle-a", "rev2")).toEqual([{ revision: "rev1", best: { totalMs: 1500, key: 7, stage: "see" } }]);
    expect(drillPriorRevisions(file, "cycle-a", "rev1")).toEqual([{ revision: "rev2", best: { totalMs: 1200, key: 7, stage: "see" } }]);
  });

  it("orders the cards of a lap slowest first, with the 迷った marks", () => {
    expect(drillSlowCards(cards, [1600, 400], [1])).toEqual([
      { index: 0, label: "C", form: null, ms: 1600, marked: false },
      { index: 1, label: "Am7", form: null, ms: 400, marked: true },
    ]);
    expect(drillSlowCards(cards, [1600, 400], [], 1)).toEqual([{ index: 0, label: "C", form: null, ms: 1600, marked: false }]);
  });

  it("compares the lap now with the self best at the same card", () => {
    expect(drillPaceTotal(lap(3000, [1000, 2000], "2026-11-01T00:00:00.000Z"), 0)).toBe(1000);
    expect(drillPaceTotal(lap(3000, [1000, 2000], "2026-11-01T00:00:00.000Z"), 1)).toBe(3000);
    expect(drillPaceTotal(undefined, 0)).toBeUndefined();
  });

  it("prints seconds to one decimal place and the key names", () => {
    expect(formatDrillSeconds(12400)).toBe("12.4");
    expect(formatDrillLap(12400)).toBe("12.4 秒");
    expect(drillKeyName(0)).toBe("C");
    expect(drillKeyName(6)).toBe("F♯");
  });
});

describe("P19 voicing drill content revision", () => {
  it("has a stable revision for every set, told apart between sets", () => {
    const revisions = DRILL_SETS.map((set) => drillSetRevision(set.id));
    expect(revisions).toHaveLength(20);
    expect(new Set(revisions).size).toBe(20);
    expect(drillSetRevision("cycle-a")).toBe(revisions[0]);
    expect(drillSetRevision("cycle-a")).toBe(drillSetRevision("cycle-a"));
    expect(() => drillSetRevision("missing")).toThrow();
  });

  it("hashes the C cards, so a changed card changes the revision", () => {
    const set = drillSetById("cycle-a")!;
    const again = JSON.stringify(set.cards.map((card) => ({ id: card.id, label: card.label, degree: card.degree, form: card.form, left: card.left, right: card.right })));
    expect(drillSetRevision("cycle-a")).toMatch(/^[0-9a-f]{8}$/);
    expect(again).toContain('"label":"C"');
  });
});
