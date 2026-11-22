import { describe, expect, it } from "vitest";
import type { EarLevelGuide } from "../../domain/earPractice";
import { guideNote } from "./EarRecordsView";

/** P23-21 R9: the one line under a level's cards, for each of the five states. */
const guide = (patch: Partial<EarLevelGuide>): EarLevelGuide => ({
  level: 1,
  chords: 0,
  progressions: 0,
  state: "none",
  needChords: 40,
  needProgressions: 5,
  ...patch,
});

describe("guideNote (P23-21 R9)", () => {
  it("C7: no chord yet says so, with 0コード", () => {
    expect(guideNote(guide({}))).toBe("まだ測っていません ・ 0コード");
  });

  it("C7: not enough yet says how many chords and progressions are missing", () => {
    expect(guideNote(guide({ chords: 12, progressions: 2, needChords: 28, needProgressions: 3, state: "none" })))
      .toBe("あと 28 コード・進行 3 つで目安が出ます");
  });

  it("C7: on-track keeps the sentence the screen already had", () => {
    expect(guideNote(guide({ chords: 22, progressions: 3, needChords: 18, needProgressions: 2, state: "on-track", firstTryRate: 0.9, medianSec: 3 })))
      .toBe("順調です(あと18コード・進行2つで目安が出ます)");
  });

  it("C7: stable keeps its sentence", () => {
    expect(guideNote(guide({ chords: 40, progressions: 5, needChords: 0, needProgressions: 0, state: "stable", firstTryRate: 0.85, medianSec: 3.2 })))
      .toBe("このレベルは安定しています。次のレベルへ進めます");
  });

  it("C7: enough says how far the figures still are, writing only the side that is missing", () => {
    expect(guideNote(guide({ chords: 40, progressions: 5, needChords: 0, needProgressions: 0, state: "enough", firstTryRate: 0.72, medianSec: 4.6 })))
      .toBe("目安まで、一発あと 8 % ・ 秒数あと 1 秒です");
    expect(guideNote(guide({ chords: 40, progressions: 5, needChords: 0, needProgressions: 0, state: "enough", firstTryRate: 0.9, medianSec: 5.1 })))
      .toBe("目安まで、秒数あと 2 秒です");
    expect(guideNote(guide({ chords: 40, progressions: 5, needChords: 0, needProgressions: 0, state: "enough", firstTryRate: 0.7, medianSec: 3.5 })))
      .toBe("目安まで、一発あと 10 %です");
  });
});
