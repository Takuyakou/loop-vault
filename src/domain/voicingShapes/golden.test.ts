import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChordQuality, ChordSymbol, Tension } from "../types";
import { buildShapeVoicing, chordMatchSets, notesMatchChord, placementNotes, type VoicingShapeId } from ".";

interface GoldenForm { form: "A" | "B" | null; left: number[]; right: number[]; candidates: [number[], number[]][] }
interface GoldenCase {
  root: number; label: string; quality: ChordQuality; tensions: Tension[]; altered: boolean; bass: number | null;
  shape: VoicingShapeId; tension: boolean; spread: boolean; used: string; forms: GoldenForm[];
}

const golden = JSON.parse(readFileSync(resolve(process.cwd(), "docs/contracts/voicing-shapes-p26/golden.json"), "utf8")) as { cases: GoldenCase[] };

export function goldenChord(entry: GoldenCase): ChordSymbol {
  return {
    root: entry.root, quality: entry.quality, tensions: [...entry.tensions], label: entry.label,
    ...(entry.altered ? { altered: true as const } : {}),
    ...(entry.bass === null ? {} : { bass: entry.bass }),
  };
}

const key = ([left, right]: readonly [readonly number[], readonly number[]]): string => `${left.join(",")}|${right.join(",")}`;

describe("P25-02 K2: the P26 golden table", () => {
  it("has the 4,320 cases and 22,530 candidates the lead generated", () => {
    expect(golden.cases).toHaveLength(4320);
    expect(golden.cases.reduce((sum, entry) => sum + entry.forms.reduce((n, form) => n + form.candidates.length, 0), 0)).toBe(22530);
  });

  it("buildShapeVoicing matches every case: used, forms, static choice and the candidate set", () => {
    const mismatches: string[] = [];
    for (const entry of golden.cases) {
      const result = buildShapeVoicing(goldenChord(entry), { shape: entry.shape, tension: entry.tension, spread: entry.spread, rootlessOrder: "auto" });
      const expectedUsed = entry.used.replace("+color", "+tension");
      const actual = {
        used: result.used,
        forms: result.forms.map((form) => ({
          form: form.form, left: [...form.staticChoice.left], right: [...form.staticChoice.right],
          candidates: form.candidates.map((cand) => key([cand.left, cand.right])).sort(),
        })),
      };
      const expected = {
        used: expectedUsed,
        forms: entry.forms.map((form) => ({ form: form.form, left: form.left, right: form.right, candidates: form.candidates.map(key).sort() })),
      };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(`${entry.root}:${entry.label}:${entry.shape}${entry.tension ? "+t" : ""}${entry.spread ? "+s" : ""}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("K9-1: every candidate of every case satisfies chordMatchSets", () => {
    const failures: string[] = [];
    for (const entry of golden.cases) {
      const sets = chordMatchSets(goldenChord(entry));
      for (const form of entry.forms) {
        for (const [left, right] of form.candidates) {
          if (!notesMatchChord(sets, placementNotes({ left, right }))) failures.push(`${entry.root}:${entry.label}:${entry.shape}:${left}|${right}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
