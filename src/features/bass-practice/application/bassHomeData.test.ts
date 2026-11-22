import { describe, expect, it } from "vitest";
import type { MidiBassAttempt } from "../midi/model";
import { createEmptyPracticeFile, type PracticeFileV2 } from "../infra/repository/practiceRepository";
import { bassHomeData } from "./bassHomeData";

/** P23-25 C5: the pinned moment. Local time, because the home words days with local getters. */
const NOW = new Date(2026, 10, 14, 21, 40);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

/** Only the stamps matter here, so the records are built as the fields this module reads. */
type RecordSet = {
  readonly attempts?: readonly { readonly completedAt?: string; readonly rating?: string }[];
  readonly rhythmAttempts?: readonly { readonly completedAt?: string }[];
  readonly chordContextHistory?: readonly { readonly completedAt?: string }[];
  readonly sourceBasslineHistory?: readonly { readonly completedAt?: string }[];
  readonly rootMotionHistory?: readonly { readonly completedAt?: string }[];
};

function file(records: RecordSet): PracticeFileV2 {
  const base: unknown = { ...createEmptyPracticeFile(NOW), ...records };
  return base as PracticeFileV2;
}

/** A MIDI attempt is only read for its stamp here. */
const midiAttempt = (completedAt: string) => ({ completedAt }) as unknown as MidiBassAttempt;

describe("bassHomeData", () => {
  it("C5: with no record there is no 続きから and the 7 days are empty", () => {
    const data = bassHomeData({ file: createEmptyPracticeFile(NOW), midiAttempts: [], now: NOW });

    expect(data.resume).toBeUndefined();
    expect(data.info).toEqual({});
    expect(data.week).toHaveLength(7);
    expect(data.week.every((day) => day.count === 0)).toBe(true);
    expect(data.week[data.week.length - 1]?.label).toBe("今日");
  });

  it("C5: a file that is not loaded yet behaves like no record", () => {
    const data = bassHomeData({ file: undefined, midiAttempts: [], now: NOW });

    expect(data.resume).toBeUndefined();
    expect(data.week.every((day) => day.count === 0)).toBe(true);
  });

  it("P5: the 7 days, 最後 and 続きから come from the records the Home already reads", () => {
    const data = bassHomeData({
      file: file({
        attempts: [
          // A rated attempt two days ago counts; an unrated one and one with no completedAt do not.
          { rating: "good", completedAt: at(12, 9) },
          { completedAt: at(14, 8) },
          { rating: "hard" },
        ],
        rhythmAttempts: [{ completedAt: at(13, 10) }],
        chordContextHistory: [{ completedAt: at(14, 20, 10) }],
        sourceBasslineHistory: [{ completedAt: at(11, 7) }],
        rootMotionHistory: [{ completedAt: at(13, 19) }],
      }),
      midiAttempts: [midiAttempt(at(14, 21, 30))],
      now: NOW,
    });

    expect(data.info.degree).toEqual({ week: [false, false, false, false, true, false, false], lastLabel: "2 日前" });
    expect(data.info.rhythm?.lastLabel).toBe("きのう");
    expect(data.info["root-motion"]?.lastLabel).toBe("きのう");
    expect(data.info.bassline?.lastLabel).toBe("今日");
    expect(data.info.midi?.lastLabel).toBe("今日");

    // 11/8..11/14, oldest first; today last.
    expect(data.week.map((day) => day.count)).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(data.info.bassline?.week.filter(Boolean)).toHaveLength(2);

    // The newest record is the MIDI attempt (today 21:30), so that is what 「続きから」 opens.
    expect(data.resume).toEqual({ mode: "midi", whenLabel: "今日 21:30" });
  });

  it("P5: a record older than 7 days is not in this week but still words 最後", () => {
    const data = bassHomeData({
      file: file({ rootMotionHistory: [{ completedAt: at(6, 12) }] }),
      midiAttempts: [],
      now: NOW,
    });

    expect(data.info["root-motion"]).toEqual({ week: [false, false, false, false, false, false, false], lastLabel: "8 日前" });
    expect(data.week.every((day) => day.count === 0)).toBe(true);
    expect(data.resume).toEqual({ mode: "root-motion", whenLabel: "11/6 12:00" });
  });
});
