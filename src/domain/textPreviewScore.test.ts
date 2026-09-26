import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { buildTextPreviewScore } from "./textPreviewScore";

describe("P8.8.2 source-derived score preview", () => {
  it("preserves eight-slot attacks, holds, rests, written spelling and annotation position", () => {
    const source = "#BPM: 132\n#イントロ\nC C = % _ G7 = %|F|G|C\n#次\nAm|Dm|G7|F7-5";
    const result = parseExtendedTextProgression(source, { beat: "4/4" });
    expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
    const items = buildTextPreviewScore(result);
    expect(items[0]).toMatchObject({ kind: "annotation", text: "イントロ" });
    const firstRow = items.find(item => item.kind === "row");
    expect(firstRow?.kind).toBe("row");
    if (firstRow?.kind !== "row") return;
    expect(firstRow.bars).toHaveLength(4);
    expect(firstRow.bars[0]?.bands[0]?.writtenChord).toBe("C");
    expect(firstRow.bars[0]?.bands[0]?.attacks).toHaveLength(3);
    expect(firstRow.bars[0]?.rests).toHaveLength(1);
    expect(firstRow.bars[0]?.bands[0]?.width).toBe(50);
    expect(items.some(item => item.kind === "annotation" && item.text === "次")).toBe(true);
    const rows = items.filter(item => item.kind === "row");
    const lastRow = rows[rows.length - 1];
    expect(lastRow?.kind === "row" && lastRow.bars[lastRow.bars.length - 1]?.bands[0]?.writtenChord).toBe("F7-5");
    expect(result.source.slice(firstRow.bars[0]!.sourceSpan.start, firstRow.bars[0]!.sourceSpan.end))
      .toBe("C C = % _ G7 = %");
  });

  it("retains the exact invalid raw bar and parser span for editor navigation", () => {
    const source = "C|F7-999|G";
    const result = parseExtendedTextProgression(source, { beat: "4/4" });
    const items = buildTextPreviewScore(result);
    const bars = items.flatMap(item => item.kind === "row" ? item.bars : []);
    expect(bars[1]?.raw).toBe("F7-999");
    expect(bars[1]?.error).toBeDefined();
    expect(source.slice(bars[1]!.sourceSpan.start, bars[1]!.sourceSpan.end)).toBe("F7-999");
  });
});
