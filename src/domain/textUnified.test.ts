import { describe, expect, it } from "vitest";
import { parseUnifiedText } from "./textUnified";

describe("P25-06 E/E2 in the one reading", () => {
  it("turns the degrees of a separated line into the key's chords", () => {
    const parsed = parseUnifiedText("I, V, vi, IV", { beat: "4/4", key: "C major", confirmed: true });
    expect(parsed.bars).toEqual([["C"], ["G"], ["Am"], ["F"]]);
  });

  it("names a dot with no chord before it, on the dot", () => {
    const parsed = parseUnifiedText("., C", { beat: "4/4" });
    const notice = parsed.diagnostics.find((entry) => entry.code === "repeat-without-chord");
    expect(notice?.message).toBe("「.」の前にコードがありません。");
    expect(notice?.rawSpan).toEqual({ start: 0, end: 1 });
    expect(notice?.line).toBe(1);
    expect(notice?.column).toBe(1);
  });

  it("names a question mark", () => {
    const parsed = parseUnifiedText("C, ?, G", { beat: "4/4" });
    const notice = parsed.diagnostics.find((entry) => entry.code === "question-mark");
    expect(notice?.message).toBe("「?」は読めません。");
    expect(notice?.rawSpan).toEqual({ start: 3, end: 4 });
  });

  it("reads 歌詞の中のコード as one chord per bar", () => {
    const parsed = parseUnifiedText("[C]きょうも[G]あるく[Am]みちを[F]", { beat: "4/4" });
    expect(parsed.bars).toEqual([["C"], ["G"], ["Am"], ["F"]]);
    expect(parsed.canConvert).toBe(true);
    expect(parsed.normalized.lyricChordLines).toHaveLength(1);
  });

  it("reads a bar line with the separators", () => {
    const parsed = parseUnifiedText("| C, G | Am, F |", { beat: "4/4" });
    expect(parsed.bars).toEqual([["C", "G"], ["Am", "F"]]);
    expect(parsed.diagnostics).toEqual([]);
  });
});
