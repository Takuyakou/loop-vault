import { describe, expect, it } from "vitest";
import type { EarChordRecord } from "../../domain/earPractice/earRecords";
import { DRILL_SETS, drillSetRevision } from "../../domain/chordDojo/voicingDrill";
import type { VoicingDrillRecords } from "../../domain/chordDojo/voicingDrillRecords";
import { completionOf, drillStageCounts, earHomeScore, newestDrillBest } from "./dojoHomeProgress";

const cards = (setId: string) => DRILL_SETS.find((set) => set.id === setId)!.cards.map((card) => ({
  id: card.id, label: card.label, degree: card.degree, form: card.form, left: [...card.left], right: [...card.right],
}));
const lap = (totalMs: number, count: number, at: string) => ({
  totalMs, at, cardMs: Array.from({ length: count }, (_, index) => index === count - 1 ? totalMs - (count - 1) * 100 : 100), marks: [],
});
const drillFile = (entries: readonly { setId: string; revision: string; key: number; stage: "see" | "recall"; at: string; totalMs: number }[]): VoicingDrillRecords => {
  const sets: Record<string, Record<string, { cards: ReturnType<typeof cards>; keys: Record<string, Record<string, unknown>> }>> = {};
  for (const entry of entries) {
    sets[entry.setId] ??= {};
    sets[entry.setId]![entry.revision] ??= { cards: cards(entry.setId), keys: {} };
    const keys = sets[entry.setId]![entry.revision]!.keys;
    keys[String(entry.key)] ??= {};
    (keys[String(entry.key)] as Record<string, unknown>)[entry.stage] = { laps: 1, best: lap(entry.totalMs, cards(entry.setId).length, entry.at), last: lap(entry.totalMs, cards(entry.setId).length, entry.at) };
  }
  return { app: "loopvault-voicing-drill", fileVersion: 1, version: 1, revision: 1, operations: [], sets } as unknown as VoicingDrillRecords;
};
const ear = (overrides: Partial<EarChordRecord>): EarChordRecord => ({
  at: "2026-11-01T00:00:00.000Z", play: "play-a", questionId: "q1", source: "bank", level: 1, length: 4, chordLevel: 1,
  kind: "三和音", index: 0, given: false, manual: false, wrongs: 0, hint: 0, replays: 0, judge: "core", ...overrides,
});

describe("P20 home progress", () => {
  it("counts a current progression once when any key has a completed lap", () => {
    const laps = { laps: {
      "jazz-001": { 0: { count: 1 }, 5: { count: 0 } },
      "jazz-002": { 3: { count: 0 } },
      retired: { 0: { count: 4 } },
    } };
    expect(completionOf(["jazz-001", "jazz-002"], laps)).toEqual({ done: 1, total: 2 });
    expect(completionOf(["jazz-002"], laps)).toEqual({ done: 0, total: 1 });
    expect(completionOf(["jazz-001"], undefined)).toEqual({ done: 0, total: 1 });
  });

  it("shows the best of the newest drill practice in the current content revision", () => {
    const cycleA = drillSetRevision("cycle-a");
    const cycleB = drillSetRevision("cycle-b");
    const file = drillFile([
      { setId: "cycle-a", revision: cycleA, key: 0, stage: "see", at: "2026-11-01T00:00:00.000Z", totalMs: 12_000 },
      { setId: "cycle-b", revision: cycleB, key: 7, stage: "recall", at: "2026-11-02T00:00:00.000Z", totalMs: 9_000 },
      // an earlier content revision is newer in time, but its best is not the current content's best
      { setId: "cycle-a", revision: "old-revision", key: 0, stage: "see", at: "2026-11-03T00:00:00.000Z", totalMs: 1_000 },
    ]);
    expect(newestDrillBest(file)).toEqual({ setId: "cycle-b", key: 7, stage: "recall", at: "2026-11-02T00:00:00.000Z", bestMs: 9_000 });
    expect(newestDrillBest(undefined)).toBeUndefined();
  });

  it("scores the ear questions by measured first-try rate, latest and best apart", () => {
    const records = [
      ear({ play: "a", at: "2026-11-01T00:00:00.000Z", wrongs: 0 }),
      ear({ play: "a", at: "2026-11-01T00:00:01.000Z", index: 1, wrongs: 1 }),
      ear({ play: "b", at: "2026-11-02T00:00:00.000Z", wrongs: 0 }),
      // not measured: no score
      ear({ play: "c", at: "2026-11-03T00:00:00.000Z", given: true }),
      ear({ play: "d", at: "2026-11-04T00:00:00.000Z", wrongs: 1 }),
      ear({ play: "d", at: "2026-11-04T00:00:01.000Z", index: 1, wrongs: 1 }),
    ];
    expect(earHomeScore(records)).toEqual({ last: 0, best: 100, lastAt: "2026-11-04T00:00:01.000Z" });
    expect(earHomeScore([])).toEqual({});
    expect(earHomeScore([ear({ given: true })])).toEqual({});
  });

  it("counts the four drill stages as 5・5・3・7", () => {
    expect(drillStageCounts.map((stage) => stage.count)).toEqual([5, 5, 3, 7]);
  });
});
