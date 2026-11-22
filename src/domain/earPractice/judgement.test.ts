import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import type { ChordSymbol } from "../types";
import { earJudge, type EarJudge, type EarJudgeTarget } from "./judge";
import { judgeEarAnswer } from "./judgement";
import { voiceForEar } from "./voicing";

const sym = (label: string) => parseTextChordLabel(label)!;
const target = (symbol: ChordSymbol, judge: EarJudge = "sounded"): EarJudgeTarget => ({
  symbol,
  judge,
  notes: voiceForEar(symbol),
});

describe("the judgement of an answer (P23-22 J1)", () => {
  const cmaj7 = sym("Cmaj7");
  const answer = [...voiceForEar(cmaj7)].sort((left, right) => left - right);

  it("C1 reads a right answer as right, without extra or missing notes", () => {
    const judged = judgeEarAnswer(target(cmaj7), answer);
    expect(judged.ok).toBe(true);
    expect(judged.message).toBe(earJudge(target(cmaj7), answer).message);
    expect(judged.extra).toEqual([]);
    expect(judged.missing).toEqual([]);
    expect(judged.bassWrong).toBe(false);
    expect(judged.empty).toBe(false);
  });

  it("C1 names the note that was extra", () => {
    const played = [...answer, answer[0]! + 2];
    const judged = judgeEarAnswer(target(cmaj7), played);
    expect(judged.ok).toBe(false);
    expect(judged.message).toBe("余分な音 D があります");
    expect(judged.extra).toEqual([2]);
    expect(judged.missing).toEqual([]);
  });

  it("C1 names the note that was missing", () => {
    const played = answer.filter((note) => note % 12 !== 11);
    const judged = judgeEarAnswer(target(cmaj7), played);
    expect(judged.ok).toBe(false);
    expect(judged.message).toBe("B がありません");
    expect(judged.extra).toEqual([]);
    expect(judged.missing).toEqual([11]);
  });

  it("C1 reads a wrong bass as wrong with the notes themselves in place", () => {
    const explicit: EarJudgeTarget = { symbol: cmaj7, judge: "sounded", notes: [48, 52, 55, 59] };
    const played = [52, 55, 59, 60];
    const judged = judgeEarAnswer(explicit, played);
    expect(judged.ok).toBe(false);
    expect(judged.message).toBe(earJudge(explicit, played).message);
    expect(judged.bassWrong).toBe(true);
    expect(judged.extra).toEqual([]);
    expect(judged.missing).toEqual([]);
  });

  it("C1 does not mind the octave of the same notes", () => {
    const played = answer.map((note) => note - 12);
    const judged = judgeEarAnswer(target(cmaj7), played);
    expect(judged.ok).toBe(true);
    expect(judged.extra).toEqual([]);
    expect(judged.missing).toEqual([]);
  });

  it("C1 says nothing was played", () => {
    const judged = judgeEarAnswer(target(cmaj7), []);
    expect(judged.ok).toBe(false);
    expect(judged.message).toBe("構成の音を弾いてください");
    expect(judged.empty).toBe(true);
    expect(judged.extra).toEqual([]);
    expect(judged.missing).toEqual([]);
  });

  it("C2 keeps the same words as the judgement for every setting and answer", () => {
    const chords = ["Cmaj7", "Dm7", "G7", "F#m7b5", "Bbmaj7", "Am7", "CmMaj7", "C7"];
    const answers = [
      (notes: number[]) => notes,
      (notes: number[]) => [...notes, notes[0]! + 1],
      (notes: number[]) => notes.slice(0, -1),
      (notes: number[]) => [...notes].reverse(),
      (notes: number[]) => notes.map((note) => note + 12),
      () => [1, 2],
      () => [],
    ];
    for (const label of chords) {
      const symbol = sym(label);
      for (const judge of ["core", "pitchset", "sounded"] as const) {
        const spec = target(symbol, judge);
        for (const shape of answers) {
          const played = shape([...spec.notes]);
          const judged = judgeEarAnswer(spec, played);
          const plain = earJudge(spec, played);
          expect({ ok: judged.ok, message: judged.message }, `${label} ${judge}`).toEqual(plain);
          // The lists never disagree with the words.
          if (judged.message.startsWith("余分な音")) {
            expect(judged.extra.length, `${label} ${judge} extra`).toBeGreaterThan(0);
          }
          if (/ がありません$/.test(judged.message)) {
            expect(judged.missing.length, `${label} ${judge} missing`).toBeGreaterThan(0);
          }
          if (judged.ok) {
            expect(judged.extra).toEqual([]);
            expect(judged.missing).toEqual([]);
          }
        }
      }
    }
  });
});
