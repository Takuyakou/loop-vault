import { describe, expect, it } from "vitest";
import { ALL_BANK, buildBankQuestion } from "../../domain/earPractice";
import { earKeyboardRange } from "./earRange";

describe("鍵盤の範囲(earRange)", () => {
  it("covers every note the progression sounds, is whole octaves from a C, and is 3 to 5 octaves (the white keys stay 18 px or more)", () => {
    for (const entry of ALL_BANK) {
      for (let tonic = 0; tonic < 12; tonic += 1) {
        const question = buildBankQuestion(entry, tonic);
        const range = earKeyboardRange(question);
        const notes = question.chords.flatMap((chord) => chord.notes);
        expect(Math.min(...notes), `${entry.id}@${tonic}`).toBeGreaterThanOrEqual(range.minMidiNote);
        expect(Math.max(...notes), `${entry.id}@${tonic}`).toBeLessThanOrEqual(range.maxMidiNote);
        // the bass is never below C2: the keyboard starts there (no octave of keys that nothing asks for)
        expect(range.minMidiNote).toBe(36);
        expect(range.minMidiNote % 12).toBe(0);
        expect((range.maxMidiNote - range.minMidiNote) % 12).toBe(0);
        expect(range.maxMidiNote - range.minMidiNote).toBeGreaterThanOrEqual(36);
        expect(range.maxMidiNote - range.minMidiNote).toBeLessThanOrEqual(60);
      }
    }
  });

  it("is decided by the question alone: it does not change from one call to the next", () => {
    const question = buildBankQuestion(ALL_BANK[10]!, 4);
    expect(earKeyboardRange(question)).toEqual(earKeyboardRange(question));
  });

  it("moves by whole octaves when the player moves it (and the move is kept for the next question)", () => {
    const question = buildBankQuestion(ALL_BANK[10]!, 4);
    const base = earKeyboardRange(question);
    const up = earKeyboardRange(question, 1);
    expect(up.minMidiNote).toBe(base.minMidiNote + 12);
    expect(up.maxMidiNote).toBe(base.maxMidiNote + 12);
    const down = earKeyboardRange(question, -1);
    expect(down.minMidiNote).toBe(base.minMidiNote - 12);
  });
});
