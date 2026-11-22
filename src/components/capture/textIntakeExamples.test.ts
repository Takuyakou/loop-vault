import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "../../domain/extendedTextProgression";
import { parseTextProgression } from "../../domain/textProgression";
import { EXTENDED_TEXT_PLACEHOLDER } from "./ExtendedTextIntakePanel";
import { STANDARD_TEXT_PLACEHOLDER } from "./StandardTextScoreWorkspace";

/** P23-17 V4/C10: the examples shown in the empty inputs are read with no errors. */
const example = (placeholder: string) => placeholder.split("\n")[0]!.replace(/^例: /, "");

describe("the examples in the empty text inputs (P23-17 V4/C10)", () => {
  it("the standard example has no diagnostics and can convert", () => {
    const result = parseTextProgression(example(STANDARD_TEXT_PLACEHOLDER), { keyState: { kind: "unknown" } });
    expect(result.diagnostics).toEqual([]);
    expect(result.canConvert).toBe(true);
  });

  it("the extended example has no errors and can convert", () => {
    const result = parseExtendedTextProgression(example(EXTENDED_TEXT_PLACEHOLDER), { beat: "4/4" });
    expect(result.diagnostics.filter((issue) => issue.severity === "ERROR")).toEqual([]);
    expect(result.canConvert).toBe(true);
  });
});
