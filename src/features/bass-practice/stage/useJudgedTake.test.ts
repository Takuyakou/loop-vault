// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { BassAnalysis } from "../midi/analysis";
import { suggestedRating, takeNotes } from "./useJudgedTake";

// P23-62: the rating the stage offers after a judged take. The player may still change it (1–4).
describe("P23-62 suggestedRating", () => {
  test("everything right without hints is easy; one hint makes it good", () => {
    expect(suggestedRating(4, 4, 0)).toBe("easy");
    expect(suggestedRating(4, 4, 1)).toBe("good");
  });

  test("three of four is good, half is hard, less is again", () => {
    expect(suggestedRating(3, 4, 0)).toBe("good");
    expect(suggestedRating(2, 4, 0)).toBe("hard");
    expect(suggestedRating(1, 4, 0)).toBe("again");
  });

  test("no notes at all is again, never easy", () => {
    expect(suggestedRating(0, 0, 0)).toBe("again");
    expect(suggestedRating(0, 4, 0)).toBe("again");
  });
});

// P23-64-fix-1: a note played outside the judging tolerance turns miss + extra into one clear box on the lane.
describe("P23-64-fix-1 takeNotes", () => {
  const bpm = 120; // 1 beat = 500ms
  const target = [{ startBeat: 2, durationBeats: 1 }];
  const makeAnalysis = (onsetBeat: number): BassAnalysis => ({
    marks: [{ kind: "miss", targetIndex: 0 }],
    extras: [{ pitch: 45, onsetMs: onsetBeat * 500, offsetMs: (onsetBeat + 0.5) * 500 }],
    counts: { correct: 0, wrongPitch: 0, timing: 0, missed: 1, extra: 1, total: 1 },
    meanOffsetMs: 0,
    latencyCorrectionMs: 0,
  });

  test("merges a missed note (beat 2) with a nearby late extra (beat 2.3) into one 「遅い」 box", () => {
    const notes = takeNotes(makeAnalysis(2.3), bpm, 4, target);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind).toBe("late");
    expect(notes[0]?.text).toBe("遅い");
    expect(notes[0]?.sub).toBe("A2");
    expect(notes[0]?.label).toBe("自分 1 音目 大きく遅い A2(判定の幅の外)");
  });

  test("merges a missed note (beat 2) with a nearby early extra (beat 1.7) into one 「早い」 box", () => {
    const notes = takeNotes(makeAnalysis(1.7), bpm, 4, target);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind).toBe("early");
    expect(notes[0]?.text).toBe("早い");
    expect(notes[0]?.sub).toBe("A2");
    expect(notes[0]?.label).toBe("自分 1 音目 大きく早い A2(判定の幅の外)");
  });

  test("keeps both 「抜け」 and 「＋」 boxes when an extra note is far away (beat 3.6)", () => {
    const notes = takeNotes(makeAnalysis(3.6), bpm, 4, target);
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.kind)).toEqual(["miss", "extra"]);
    expect(notes.map((n) => n.text)).toEqual(["抜け", "＋"]);
  });
});
