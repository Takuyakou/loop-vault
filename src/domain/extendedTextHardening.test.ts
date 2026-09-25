import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe("P8.8 fixed-seed runtime hardening", () => {
  it("retains every generated bar and attack without changing raw text", () => {
    const next = seeded(0x88f00d);
    const labels = ["C", "Dm7", "G7", "F", "Am", "Bb"];
    for (let sample = 0; sample < 128; sample += 1) {
      const barCount = next() % 16 + 1;
      const bars = Array.from({ length: barCount }, () =>
        labels[next() % labels.length]!);
      const source = "# public synthetic fixture " + sample + "\r\n| " + bars.join(" | ") + " |";
      const result = parseExtendedTextProgression(source, { beat: "4/4" });
      expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
      expect(result.source).toBe(source);
      expect(result.bars).toHaveLength(barCount);
      expect(result.slots).toHaveLength(barCount);
      expect(result.slots.map(slot => slot.raw)).toEqual(bars);
      expect(result.harmonicSpans.flatMap(span => span.attacks)).toHaveLength(barCount);
      expect(result.scoreLengthBeats).toBe(barCount * 4);
    }
  });

  it("produces deterministic, in-range diagnostics for fixed-seed mutations", () => {
    const next = seeded(0x881234);
    const alphabet = ["C", "D", "m", "#", "/", "|", " ", "\r", "\n", "♭", "😀", "_", "%", "(", ")"];
    for (let sample = 0; sample < 256; sample += 1) {
      const length = next() % 72;
      let source = "";
      for (let index = 0; index < length; index += 1) source += alphabet[next() % alphabet.length]!;
      const first = parseExtendedTextProgression(source, { beat: "4/4" });
      const second = parseExtendedTextProgression(source, { beat: "4/4" });
      expect(first).toEqual(second);
      expect(first.source).toBe(source);
      for (const diagnostic of first.diagnostics) {
        expect(diagnostic.span.start).toBeGreaterThanOrEqual(0);
        expect(diagnostic.span.end).toBeLessThanOrEqual(source.length);
        expect(diagnostic.line).toBeGreaterThanOrEqual(1);
        expect(diagnostic.column).toBeGreaterThanOrEqual(1);
      }
      if (first.state !== "VALID") expect(first.canConvert).toBe(false);
    }
  });

  it("rejects excessive sections before Vault serialization and preserves the source", () => {
    const source = "# public synthetic comment\r\n".repeat(EXTENDED_TEXT_LIMITS.maxComments + 1) + "| C |";
    const result = parseExtendedTextProgression(source);
    expect(result.state).toBe("INVALID");
    expect(result.canConvert).toBe(false);
    expect(result.source).toBe(source);
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain("INPUT_LIMIT_EXCEEDED");
  });

  it("bounds long input without dropping the original text", () => {
    const source = "C".repeat(EXTENDED_TEXT_LIMITS.maxInputCodeUnits + 1);
    const result = parseExtendedTextProgression(source);
    expect(result.state).toBe("INVALID");
    expect(result.canConvert).toBe(false);
    expect(result.source).toBe(source);
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain("INPUT_LIMIT");
  });

  it("keeps explicit rest silent and reattacks after it", () => {
    const result = parseExtendedTextProgression("| C _ C % |", { beat: "4/4" });
    expect(result.state).toBe("VALID");
    expect(result.slots.map(slot => slot.kind)).toEqual(["attack", "rest", "attack", "reattack"]);
    expect(result.harmonicSpans).toHaveLength(2);
    expect(result.harmonicSpans.map(span => span.attacks.length)).toEqual([1, 2]);
  });
});