import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUnifiedText } from "./textUnified";

/**
 * P24-05 05-a: the 806 inputs P24-00 collected (`scripts/p24-00/out/d1-diff.json`, from the investigation
 * branch) read through the one entry must follow the design's decision table:
 *
 * - a case both grammars read the same way stays the same (canConvert and bar count);
 * - the extended-only cases read (they are the majority: 3/5 cells, `on` bass, full-width, `<` `>`);
 * - a rest-only progression reads (the old standard's answer);
 * - `Cadd9(#9,#5)`-style conflicts are an error (the extended grammar's `AMBIGUOUS_SEGMENTATION`);
 * - a heading line never eats a bar;
 * - a degree without a confirmed key is an error.
 */
interface Case {
  readonly source: string;
  readonly extended: { readonly canConvert: boolean; readonly barCount: number; readonly diagnostics: string };
  readonly standard: { readonly unknownKey: { readonly canConvert: boolean } };
  readonly diff: { readonly primary: string };
}

const report = JSON.parse(readFileSync("scripts/p24-00/out/d1-diff.json", "utf8")) as { cases: Case[] };
const cases = report.cases;

const hasHeading = (source: string): boolean => source.split("\n").some((line) => /^\[[^\]]*\]$/.test(line.trim()));
const AMBIGUOUS_9 = /ADD9\([^)]*(?:#9|b9)/i;

describe("P24-05 the one text grammar over the collected inputs", () => {
  it("reads every input the extended grammar read, with the same bar count", () => {
    let checked = 0;
    for (const entry of cases) {
      if (hasHeading(entry.source) || AMBIGUOUS_9.test(entry.source)) continue;
      const unified = parseUnifiedText(entry.source, { beat: "4/4" });
      if (entry.extended.canConvert) {
        expect(unified.canConvert, entry.source).toBe(true);
        expect(unified.bars.length, entry.source).toBe(entry.extended.barCount);
        checked += 1;
      } else if (entry.standard.unknownKey.canConvert && unified.canConvert) {
        // The old standard read it (rest-only): the one grammar keeps that answer.
        expect(unified.spans.length, entry.source).toBe(0);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(700);
  });

  it("keeps a rest-only progression readable", () => {
    for (const source of ["| _ |", "| _ | _ |"]) {
      const unified = parseUnifiedText(source, { beat: "4/4" });
      expect(unified.canConvert, source).toBe(true);
      expect(unified.spans.length, source).toBe(0);
    }
  });

  it("refuses the added-and-altered ninth that cannot be read one way", () => {
    for (const source of ["| Cadd9(#9, #5) |", "| CADD9(#9,#5) |", "| FADD9(#9,#5) |"]) {
      const unified = parseUnifiedText(source, { beat: "4/4" });
      expect(unified.canConvert, source).toBe(false);
      expect(unified.diagnostics.map((entry) => entry.code), source).toContain("ambiguous-tokenization");
    }
  });

  it("never lets a heading line eat a bar", () => {
    const unified = parseUnifiedText("[Intro]\n| C | G7 |", { beat: "4/4" });
    expect(unified.canConvert).toBe(true);
    expect(unified.bars.length).toBe(2);
    expect(unified.normalized.headings.map((heading) => heading.heading)).toEqual(["Intro"]);
  });

  it("reads degrees only with a confirmed key", () => {
    const without = parseUnifiedText("| ii7 | V7 | Imaj7 |", { beat: "4/4" });
    expect(without.canConvert).toBe(false);
    expect(without.diagnostics.some((entry) => entry.code === "degree-requires-confirmed-key")).toBe(true);
    const withKey = parseUnifiedText("| ii7 | V7 | Imaj7 |", { beat: "4/4", key: "C major", confirmed: true });
    expect(withKey.canConvert).toBe(true);
    expect(withKey.spans.map((span) => span.writtenChord)).toEqual(["Dm7", "G7", "Cmaj7"]);
  });

  it("reads the bar count the same way whether or not a key is chosen", () => {
    const source = "A m7 G 7 F M7 C add9";
    expect(parseUnifiedText(source, { beat: "4/4" }).bars.length).toBe(4);
    expect(parseUnifiedText(source, { beat: "4/4", key: "C major", confirmed: true }).bars.length).toBe(4);
  });
});
