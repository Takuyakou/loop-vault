import { describe, expect, it } from "vitest";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";
import { parseExtendedTextProgression, type ExtendedTextReasonCode } from "./extendedTextProgression";

describe("P8.8.1 diagnostic reasons", () => {
  it.each([
    ["| H7 |", "UNKNOWN_TOKEN"],
    ["| Cxyz |", "UNKNOWN_CHORD"],
    ["| CADD9(#9,#5) |", "AMBIGUOUS_TOKENIZATION"],
    ["| C///E |", "INVALID_STRUCTURE"],
    ["| C D E F G A B |", "UNSUPPORTED_SUBDIVISION"],
  ] as const)("separates %s as %s and keeps its raw bar", (source, reason) => {
    const result = parseExtendedTextProgression(source);
    expect(result.canConvert).toBe(false);
    expect(result.diagnostics.map(issue => issue.reasonCode)).toContain(reason);
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]?.join(" ").trim()).not.toBe("");
    expect(result.diagnostics.every(issue => issue.line >= 1 && issue.column >= 1
      && issue.span.start >= 0 && issue.span.end <= source.length)).toBe(true);
  });

  it("identifies meter and resource failures independently", () => {
    const meter = parseExtendedTextProgression("| C |", { beat: "13/4" });
    const length = parseExtendedTextProgression("C".repeat(EXTENDED_TEXT_LIMITS.maxInputCodeUnits + 1));
    const expected: ExtendedTextReasonCode[] = ["UNSUPPORTED_METER", "INPUT_LIMIT_EXCEEDED"];
    expect(meter.diagnostics.map(d => d.reasonCode)).toContain(expected[0]);
    expect(length.diagnostics.map(d => d.reasonCode)).toContain(expected[1]);
  });

  it("retains the legacy diagnostic code for the frozen PRE corpus", () => {
    const result = parseExtendedTextProgression("| C///E |");
    expect(result.diagnostics[0]).toMatchObject({
      code: "MALFORMED_SLASH",
      reasonCode: "INVALID_STRUCTURE",
    });
  });
});
