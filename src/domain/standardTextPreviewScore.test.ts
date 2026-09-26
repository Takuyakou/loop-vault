import { describe, expect, it } from "vitest";
import { parseTextProgression } from "./textProgression";
import { buildStandardTextPreviewScore } from "./standardTextPreviewScore";

function bars(input: string) {
  return buildStandardTextPreviewScore(parseTextProgression(input))
    .flatMap(item => item.kind === "row" ? item.bars : []);
}

describe("Standard score preview adapter", () => {
  it("uses parser timing for one, two and four cells without changing the Standard grammar", () => {
    const score = bars("| C | Dm G7 | C D E F |");
    expect(score.map(bar => bar.bands.length)).toEqual([1, 2, 4]);
    expect(score.map(bar => bar.bands.map(band => band.width))).toEqual([[100], [50, 50], [25, 25, 25, 25]]);
    expect(score[1]?.bands.map(band => band.left)).toEqual([0, 50]);
  });

  it("retains authored spelling and exact UTF-16 source ranges", () => {
    const source = "| Db7(#9) BbM7 |";
    const score = bars(source);
    expect(score[0]?.bands.map(band => band.writtenChord)).toEqual(["Db7(#9)", "BbM7"]);
    for (const band of score[0]!.bands) {
      expect(source.slice(band.sourceSpan.start, band.sourceSpan.end)).toBe(band.writtenChord);
    }
  });

  it("shows reattack, hold, rest and an invalid raw bar without inventing timing", () => {
    const accepted = bars("| C % = _ |");
    expect(accepted[0]?.bands.map(band => [band.writtenChord, band.width])).toEqual([["C", 25], ["C", 50]]);
    expect(accepted[0]?.bands[1]?.attacks[0]?.kind).toBe("repeat");
    expect(accepted[0]?.rests.map(rest => rest.width)).toEqual([25]);
    const rejected = bars("| C D E |");
    expect(rejected[0]?.error).toBeDefined();
    expect(rejected[0]?.raw).toBe(" C D E ");
  });

  it("keeps four bars per score row", () => {
    const rows = buildStandardTextPreviewScore(parseTextProgression("| C | D | E | F | G |"));
    expect(rows.map(row => row.kind === "row" ? row.bars.length : 0)).toEqual([4, 1]);
  });
});
