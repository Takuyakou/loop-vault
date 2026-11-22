import { describe, expect, it } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock, SongIdea } from "../../domain/types";
import { createEmptyPracticeFile, type PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import { collectPracticeRecords } from "./practiceActivity";
import type { PracticeOpen } from "./practiceOpens";
import { practiceWeek } from "./practiceWeek";
import { deriveHomeSummary } from "./useHomeSummary";

/** P23-08 §2・§3: the 7 days of each practice, and the Home's most-opened progressions. */
const now = new Date(2026, 10, 13, 12, 0);
const day = (offset: number, hour = 10) => new Date(2026, 10, 13 - offset, hour, 0);
const open = (blockId: string, via: PracticeOpen["via"], at: Date): PracticeOpen => ({ ideaId: "idea", blockId, via, at: at.toISOString() });

function block(index: number, practisedAt?: Date): SavedProgressionBlock {
  return {
    id: `block-${index}`,
    summaryText: `Loop ${index}`,
    chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" }, confidence: 0.9, alternatives: [], warnings: [] }],
    detectedKey: "C",
    bpm: 90,
    tags: [],
    capturedAt: new Date(2026, 10, index).toISOString(),
    analyzerVersion: "p23-08-test",
    ...(practisedAt ? { practice: { lastPracticedAt: practisedAt.toISOString() } as never } : {}),
  };
}
const ideasWith = (blocks: SavedProgressionBlock[]): SongIdea[] => [makeIdea({ id: "idea", title: "Idea", updatedAt: day(20).toISOString(), progressionBlocks: blocks })];
const bassFile = (...at: Date[]): PracticeFileV2 => ({ ...createEmptyPracticeFile(now), rhythmAttempts: at.map((time) => ({ completedAt: time.toISOString() }) as never) });

describe("practice week (P23-08 §2)", () => {
  it("T10: 7 days, oldest first, today last; a Voicing Loop open 3 days ago marks the 4th from the end only", () => {
    const week = practiceWeek([], [open("block-1", "voicing-loop", day(3)), open("block-1", "chord-dojo", day(1))], now);
    expect(week["voicing-loop"]).toEqual([false, false, false, true, false, false, false]);
    expect(week["chord-dojo"]).toEqual([false, false, false, false, false, false, false]);
    expect(week["bass-practice"]).toHaveLength(7);
  });

  it("T11: Chord Dojo and Bass Practice come from the existing records; older than 7 days is not in it", () => {
    const ideas = ideasWith([block(1, day(0)), block(2, day(7))]);
    const { records } = collectPracticeRecords(ideas, bassFile(day(2), day(9)), undefined, []);
    const week = practiceWeek(records, [], now);
    expect(week["chord-dojo"]).toEqual([false, false, false, false, false, false, true]);
    expect(week["bass-practice"]).toEqual([false, false, false, false, true, false, false]);
    expect(week["voicing-loop"]).toEqual([false, false, false, false, false, false, false]);
  });

  it("the day starts at this PC's midnight", () => {
    const week = practiceWeek([], [open("block-1", "voicing-loop", new Date(2026, 10, 12, 23, 59)), open("block-1", "voicing-loop", new Date(2026, 10, 7, 0, 1))], now);
    expect(week["voicing-loop"]).toEqual([true, false, false, false, false, true, false]);
  });
});

describe("the Home summary's new parts (P23-08 §3)", () => {
  it("T12: topOpened keeps only progressions still in the Vault, three at most, the same entries as progressions", () => {
    const ideas = ideasWith([block(1), block(2), block(3), block(4)]);
    const opens = [
      open("gone", "voicing-loop", day(0, 9)), open("gone", "voicing-loop", day(0, 9)), open("gone", "voicing-loop", day(0, 9)), open("gone", "voicing-loop", day(0, 9)),
      open("block-1", "voicing-loop", day(1)), open("block-1", "chord-dojo", day(1)), open("block-1", "voicing-loop", day(1)),
      open("block-2", "voicing-loop", day(2)), open("block-2", "voicing-loop", day(2)),
      open("block-3", "chord-dojo", day(3)),
      open("block-4", "chord-dojo", day(4)),
    ];
    const summary = deriveHomeSummary(ideas, undefined, now, undefined, [], { practiceOpens: opens });
    expect(summary.topOpened.map((entry) => [entry.progression.block.id, entry.count])).toEqual([["block-1", 3], ["block-2", 2], ["block-3", 1]]);
    for (const entry of summary.topOpened) expect(summary.progressions).toContain(entry.progression);
    expect(summary.practiceWeek["voicing-loop"]).toEqual([false, false, false, false, true, true, true]);
    expect(summary.practiceWeek["chord-dojo"]).toHaveLength(7);
    expect(summary.practiceWeek["bass-practice"]).toHaveLength(7);
  });

  it("T12: nothing opened means an empty topOpened", () => {
    expect(deriveHomeSummary(ideasWith([block(1)]), undefined, now).topOpened).toEqual([]);
  });

  it("T13: Voicing Loop opens never change the existing activity", () => {
    const ideas = ideasWith([block(1, day(0)), block(2, day(2))]);
    const without = deriveHomeSummary(ideas, bassFile(day(1)), now);
    const withOpens = deriveHomeSummary(ideas, bassFile(day(1)), now, undefined, [], {
      practiceOpens: [open("block-1", "voicing-loop", day(0)), open("block-2", "voicing-loop", day(3)), open("block-1", "voicing-loop", day(4))],
    });
    expect(withOpens.activity).toEqual(without.activity);
  });
});
