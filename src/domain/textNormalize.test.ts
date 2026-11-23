import { describe, expect, it } from "vitest";
import { mergeNormalizeChanges, normalizeTextScore } from "./textNormalize";

describe("P24-05 the normalising layer", () => {
  it("makes full-width spelling half-width and says where it changed", () => {
    const result = normalizeTextScore("Ｃｍ７｜Ｆ７");
    expect(result.text).toBe("Cm7|F7");
    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes) {
      expect(result.lines[change.line - 1]!.raw.slice(change.start, change.end)).toBe(change.from);
      expect(change.to.length).toBeGreaterThan(0);
    }
  });

  it("spells the same chord the same way", () => {
    const result = normalizeTextScore("| CM7 | C△7 | C-7 | ConG |");
    expect(result.text).toBe("| Cmaj7 | Cmaj7 | Cm7 | C/G |");
  });

  it("leaves a lone hyphen alone", () => {
    const result = normalizeTextScore("| C - | Dm |");
    expect(result.text).toBe("| C - | Dm |");
    expect(result.changes).toEqual([]);
  });

  it("collapses runs of spaces", () => {
    expect(normalizeTextScore("Am   G  F").text).toBe("Am G F");
  });

  it("skips lyric lines and reads chord lines, including the repeat note", () => {
    const result = normalizeTextScore(["A day in the life", "日本語の歌詞です", "Am  G  F  (x2)", "| Cmaj7 | Dm7 |"].join("\n"));
    expect(result.lines.map((line) => line.kind)).toEqual(["skipped", "skipped", "code", "code"]);
    expect(result.skipped).toHaveLength(2);
    expect(result.restructured).toBe(true);
    expect(result.text).toBe("Am G F (x2)\n| Cmaj7 | Dm7 |");
  });

  it("treats a line that is only a bracketed name as a heading", () => {
    const result = normalizeTextScore("[Intro]\n| C | G7 |\n[サビ]\n| F |");
    expect(result.lines.map((line) => line.kind)).toEqual(["heading", "code", "heading", "code"]);
    expect(result.headings.map((heading) => heading.heading)).toEqual(["Intro", "サビ"]);
    expect(result.text).toBe("| C | G7 |\n| F |");
  });

  it("does not take a lowercase root as a chord name", () => {
    expect(normalizeTextScore("am G").lines[0]!.kind).toBe("skipped");
  });

  it("reads a line the user asked to read as code", () => {
    const plain = normalizeTextScore("hello world");
    expect(plain.lines[0]!.kind).toBe("skipped");
    const forced = normalizeTextScore("hello world", { readAsCode: ["hello world"] });
    expect(forced.lines[0]!.kind).toBe("code");
  });

  it("keeps a comment line for the parser", () => {
    const result = normalizeTextScore("# Key: C\n| C | G7 |");
    expect(result.lines[0]!.kind).toBe("comment");
    expect(result.text).toBe("# Key: C\n| C | G7 |");
  });
});

describe("P24-fix-2 the tidied-change count", () => {
  it("counts a tidied chord or bar line as one place, not one per character", () => {
    const result = normalizeTextScore("｜　Ｆmaj7　　G7 ｜\n| C△7 C7 |");
    const runs = mergeNormalizeChanges(result.changes)
      .filter(run => run.from.trim() !== "" || run.to.trim() !== "");
    // ｜ (start), Ｆmaj7, ｜ (end), C△7 — the full-width spaces are not places and do not join groups.
    expect(runs).toHaveLength(4);
    expect(runs.map(run => run.from)).toEqual(["｜", "Ｆ", "｜", "C△7"]);
  });

  it("merges neighbouring tidied characters into one underline", () => {
    const result = normalizeTextScore("１２３");
    const runs = mergeNormalizeChanges(result.changes);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: "１２３", to: "123" });
  });
});
