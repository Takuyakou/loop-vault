import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { NAMES } from "../chordDojo/recipes";
import { earJudge, type EarJudge, type EarJudgeTarget } from "./judge";
import { judgeEarAnswer } from "./judgement";
import { voiceForEar } from "./voicing";

/**
 * P23-23a S13/C4: the one missing note name the words themselves say.
 * The words never change; this only reads the name back out of them, so a screen can mark one dotted chip and no more.
 */
const sym = (label: string) => parseTextChordLabel(label)!;
const target = (symbol: ReturnType<typeof sym>, judge: EarJudge = "sounded"): EarJudgeTarget => ({
  symbol,
  judge,
  notes: voiceForEar(symbol),
});
const pcs = (notes: readonly number[]) => notes.map((note) => ((note % 12) + 12) % 12);
const without = (notes: readonly number[], ...excluded: number[]) =>
  notes.filter((note) => !excluded.includes(((note % 12) + 12) % 12));

describe("namedMissing: the missing note name the words say (P23-23a S13)", () => {
  it("reads the name of the one missing note (sounded, core, pitchset)", () => {
    for (const judge of ["sounded", "core", "pitchset"] as const) {
      const spec = target(sym("Cmaj7"), judge);
      const played = without(spec.notes, 11);
      const judged = judgeEarAnswer(spec, played);
      expect(judged.ok, judge).toBe(false);
      expect(judged.message, judge).toBe("B がありません");
      expect(judged.namedMissing, judge).toBe(11);
      expect(judged.message).toContain(NAMES[judged.namedMissing!]);
      expect(judged.missing, judge).toContain(11);
    }
  });

  it("names only the one missing note the words say when two are missing", () => {
    const spec = target(sym("Cmaj7"), "pitchset");
    const played = without(spec.notes, 7, 11);
    const judged = judgeEarAnswer(spec, played);
    expect(judged.missing).toEqual(expect.arrayContaining([7, 11]));
    expect(judged.message).toBe("G がありません");
    expect(judged.namedMissing).toBe(7);
    expect(judged.message).toContain(NAMES[judged.namedMissing!]);
  });

  it("reads the major 7th the mMaj7 words name (長7度(...))", () => {
    const spec = target(sym("CmMaj7"), "core");
    // The root and the minor 3rd are all the core judgement asks for; the 7th is the point of the chord and is named.
    const played = spec.notes.filter((note) => [0, 3].includes(((note % 12) + 12) % 12));
    const judged = judgeEarAnswer(spec, played);
    expect(judged.ok).toBe(false);
    expect(judged.message).toMatch(/^長7度\(.+\)がありません$/);
    expect(judged.namedMissing).toBe(11);
    expect(judged.message).toContain(NAMES[judged.namedMissing!]);
    expect(judged.missing).toContain(11);
  });

  it("names nothing when the words name no missing note", () => {
    const cmaj7 = target(sym("Cmaj7"));
    const extra = judgeEarAnswer(cmaj7, [...cmaj7.notes, cmaj7.notes[0]! + 2]);
    expect(extra.message.startsWith("余分な音")).toBe(true);
    expect(extra.namedMissing).toBeUndefined();

    const explicit: EarJudgeTarget = { symbol: sym("Cmaj7"), judge: "sounded", notes: [48, 52, 55, 59] };
    const bassWrong = judgeEarAnswer(explicit, [52, 55, 59, 60]);
    expect(bassWrong.bassWrong).toBe(true);
    expect(bassWrong.namedMissing).toBeUndefined();

    const empty = judgeEarAnswer(cmaj7, []);
    expect(empty.empty).toBe(true);
    expect(empty.namedMissing).toBeUndefined();

    const right = judgeEarAnswer(cmaj7, [...cmaj7.notes]);
    expect(right.ok).toBe(true);
    expect(right.namedMissing).toBeUndefined();
  });

  it("keeps the words exactly as the judgement says them", () => {
    for (const label of ["Cmaj7", "Bbmaj7", "CmMaj7", "F#m7b5", "G7"]) {
      for (const judge of ["core", "pitchset", "sounded"] as const) {
        const spec = target(sym(label), judge);
        const names = pcs(spec.notes);
        const played = without(spec.notes, names[names.length - 1]!);
        const judged = judgeEarAnswer(spec, played);
        expect({ ok: judged.ok, message: judged.message }, `${label} ${judge}`).toEqual(earJudge(spec, played));
        if (judged.namedMissing !== undefined) {
          expect(judged.message, `${label} ${judge}`).toContain(NAMES[judged.namedMissing]);
        }
      }
    }
  });
});
