import { describe, expect, it } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock } from "../../domain/types";
import type { PracticeFileV2 } from "../../features/bass-practice/infra/repository/practiceRepository";
import { summarizePracticeActivity } from "./practiceActivity";

const now = new Date(2026, 8, 28, 20, 0);
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();

function block(id: string, practice?: SavedProgressionBlock["practice"]): SavedProgressionBlock {
  return { id, summaryText: id, chords: [], tags: [], capturedAt: at(1), analyzerVersion: "test", ...(practice ? { practice } : {}) };
}

function practiceFile(parts: Partial<Record<keyof PracticeFileV2, unknown[]>>): PracticeFileV2 {
  return {
    attempts: [], rhythmAttempts: [], chordContextHistory: [], rootMotionHistory: [], sourceBasslineHistory: [],
    ...parts,
  } as unknown as PracticeFileV2;
}

describe("today's practice", () => {
  it("counts today's Chord Dojo and Bass Practice records and the local-date streak", () => {
    const ideas = [makeIdea({
      id: "idea",
      progressionBlocks: [
        block("dojo-today", { schemaVersion: 1, progressionFingerprint: "a", lastPracticedAt: at(28, 9) }),
        block("dojo-yesterday", { schemaVersion: 1, progressionFingerprint: "b", lastPracticedAt: at(27) }),
        block("never"),
      ],
    })];
    const file = practiceFile({
      attempts: [
        { rating: "good", completedAt: at(28, 10) },
        { rating: "easy", completedAt: at(26) },
        { completedAt: undefined },
      ],
      rhythmAttempts: [{ completedAt: at(28, 11) }],
    });
    const activity = summarizePracticeActivity(ideas, file, now);
    expect(activity.today).toEqual({ "chord-dojo": 1, "bass-practice": 2 });
    expect(activity.todayTotal).toBe(3);
    expect(activity.streakDays).toBe(3);
    expect(activity.recentDays.map((day) => day.practiced)).toEqual([false, false, true, true, true]);
    expect(activity.recentDays[4]).toMatchObject({ today: true, date: "2026-09-28" });
  });

  it("keeps yesterday's streak alive until today has a record, and breaks on a gap", () => {
    const withYesterday = practiceFile({ rhythmAttempts: [{ completedAt: at(27) }, { completedAt: at(26) }, { completedAt: at(24) }] });
    const activity = summarizePracticeActivity([], withYesterday, now);
    expect(activity.todayTotal).toBe(0);
    expect(activity.streakDays).toBe(2);
    expect(summarizePracticeActivity([], practiceFile({ rhythmAttempts: [{ completedAt: at(25) }] }), now).streakDays).toBe(0);
  });

  it("does not count records without a date", () => {
    const ideas = [makeIdea({ progressionBlocks: [block("undated", { schemaVersion: 1, progressionFingerprint: "c", confirmedLevel: 2 })] })];
    const file = practiceFile({ attempts: [{ rating: "hard" }] });
    const activity = summarizePracticeActivity(ideas, file, now);
    expect(activity.undatedCount).toBe(2);
    expect(activity.todayTotal).toBe(0);
    expect(activity.streakDays).toBe(0);
  });

  it("points 'continue' at the newest record whose progression still exists", () => {
    const ideas = [makeIdea({
      id: "idea",
      progressionBlocks: [block("older", { schemaVersion: 1, progressionFingerprint: "d", lastPracticedAt: at(20) })],
    })];
    const file = practiceFile({
      sourceBasslineHistory: [
        { completedAt: at(27), source: { reference: { ideaId: "idea", blockId: "older" } } },
        { completedAt: at(28), source: { reference: { ideaId: "idea", blockId: "deleted" } } },
      ],
    });
    const activity = summarizePracticeActivity(ideas, file, now);
    expect(activity.latest).toMatchObject({ kind: "bass-practice", reference: { ideaId: "idea", blockId: "older" } });
    expect(summarizePracticeActivity(ideas, undefined, now).latest).toMatchObject({ kind: "chord-dojo" });
    expect(summarizePracticeActivity([], undefined, now).latest).toBeUndefined();
  });
});
